import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ReadError, readDate, readWorkbook } from '@/services/excelReader'

type Cell = string | number | null

/** Builds an xlsx workbook in memory; the sheets are created in the given order. */
function multiSheetWorkbook(sheets: [name: string, rows: Cell[][]][]): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

function workbook(rows: Cell[][], sheetName = 'Données Globales'): Uint8Array {
  return multiSheetWorkbook([[sheetName, rows]])
}

/** Column headers of the export, in French as in the source data. */
const HEADERS = [
  'Numéro', 'SEF', 'Libellé', 'Description', 'Équipe', 'Rame', 'Véhicule',
  'Date de création', 'Commentaire', 'Créée par', 'Jours Ouvrés Écoulés', 'Statut Alerte Takt', 'Priorité',
]

describe('readWorkbook — export identical to the « Données Globales » sheet', () => {
  it('reads the 13 columns and recomputes the priority from K', async () => {
    const { anomalies, sheet, daysSourceCounts } = await readWorkbook(
      workbook([
        HEADERS,
        // Fictitious data: no real name nor label may appear in the tests.
        [33, 'Non', 'Absent', 'Pièce manquante', 'MONTAGE 1  ', 'X76611', 'X76611', 46230, 'En attente de pièce', 'A. EXEMPLE', 39, '🚨 >4j Jours Ouvrés', 'PRIORITÉ FAUSSE'],
        [210, 'Non', 'Pré Peinture', 'Retouche', 'Peinture', 'X76611', 'XR761611', 46280, null, 'B. EXEMPLE', 2, 'Conforme', 'Mineure'],
      ]),
    )

    expect(sheet).toBe('Données Globales')
    expect(daysSourceCounts).toEqual({ file: 2, computed: 0, missing: 0 })
    expect(anomalies[0]).toMatchObject({
      row: 2,
      number: '33',
      team: 'MONTAGE 1',
      teamKey: 'MONTAGE 1',
      trainsetKey: 'X76611',
      creationDate: '2026-07-27',
      businessDays: 39,
      daysSource: 'file',
      alertStatus: '🚨 >4j Jours Ouvrés',
      // The « Priorité » column of the file is ignored: only the formula is authoritative.
      priority: 'blocking',
    })
    expect(anomalies[1]).toMatchObject({ teamKey: 'PEINTURE', priority: 'minor', comment: '' })
  })

  it('locates the columns by their name, whatever their order or case', async () => {
    const { anomalies } = await readWorkbook(
      workbook([
        ['RAME', 'equipe', 'jours ouvres ecoules', 'NUMERO'],
        ['Z27575', 'NUIT', 4, 7],
      ]),
    )
    expect(anomalies[0]).toMatchObject({ number: '7', teamKey: 'NUIT', trainsetKey: 'Z27575', priority: 'major' })
  })

  it('reads the CSV export of the clé API, whose columns stop at « Créée par »', async () => {
    const { anomalies, daysSourceCounts } = await readWorkbook(
      workbook([
        ['Numéro', 'SEF', "Libellé de l'anomalie", 'Description', 'Équipe', 'Rame', 'Véhicule', 'Date de création', 'Commentaire', 'Créée par'],
        [33, 'Non', 'Absent', 'Pièce manquante', 'MONTAGE 1', 'X76611', 'X76611', '27/07/2026', 'En attente de pièce', 'A. EXEMPLE'],
      ]),
      { referenceDate: '2026-09-18' },
    )

    expect(anomalies[0]).toMatchObject({ number: '33', label: 'Absent', teamKey: 'MONTAGE 1', businessDays: 39, daysSource: 'computed', priority: 'blocking' })
    expect(daysSourceCounts).toEqual({ file: 0, computed: 1, missing: 0 })
  })

  it('tolerates a title above the header row', async () => {
    const { anomalies } = await readWorkbook(
      workbook([['Export clé du 18/09/2026'], [], HEADERS, [1, 'Non', 'Absent', 'x', 'NUIT', 'Z27575', 'Z27575', 46282, null, 'A', 1, 'Conforme', 'Mineure']]),
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.row).toBe(4)
  })

  it('keeps multi-line descriptions inside a single anomaly', async () => {
    const { anomalies } = await readWorkbook(
      workbook([HEADERS, [125, 'Non', 'Branchement', 'Première ligne\nDeuxième ligne\nTroisième ligne', 'MONTAGE 1', 'Z27575', 'Z27575', 46275, null, 'C. EXEMPLE', 5, null, null]]),
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.description).toBe('Première ligne\nDeuxième ligne\nTroisième ligne')
  })

  it('skips entirely empty rows', async () => {
    const { anomalies } = await readWorkbook(workbook([HEADERS, [], [1, null, null, null, 'NUIT', 'Z27575', null, null, null, null, 3, null, null], []]))
    expect(anomalies).toHaveLength(1)
  })
})

describe('readWorkbook — CSV export of the clé API, whose fields are never quoted', () => {
  const CSV_HEADER = "Numéro;SEF;Libellé de l'anomalie;Description;Équipe;Rame;Véhicule;Date de création;Commentaire;Créée par"
  const csv = (text: string) => new TextEncoder().encode(text)

  it('joins back a record cut by a line break inside a field', async () => {
    // The comment of anomaly 1 holds a line break: unquoted, it spills onto the next line.
    const { anomalies } = await readWorkbook(
      csv(`${CSV_HEADER}\n1;Non;Absent;Pièce manquante;NUIT;Z27575;Z27575;10/09/2026;Première ligne\nDeuxième ligne;A. EXEMPLE\n2;Non;Serrage;Écrou;NUIT;Z27575;Z27575;11/09/2026;;B. EXEMPLE\n`),
      { referenceDate: '2026-09-18' },
    )

    expect(anomalies).toHaveLength(2)
    expect(anomalies[0]).toMatchObject({ number: '1', comment: 'Première ligne\nDeuxième ligne', createdBy: 'A. EXEMPLE' })
    expect(anomalies[1]).toMatchObject({ number: '2', createdBy: 'B. EXEMPLE' })
  })

  it('joins a record spread over more than two lines', async () => {
    const { anomalies } = await readWorkbook(
      csv(`${CSV_HEADER}\n1;Non;Branchement;Repère P15\nP9, P10\nP17;NUIT;Z27575;Z27575;10/09/2026;;A. EXEMPLE\n`),
      { referenceDate: '2026-09-18' },
    )

    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toMatchObject({ number: '1', description: 'Repère P15\nP9, P10\nP17', team: 'NUIT' })
  })

  it('reads the dates as day/month/year, never the American way', async () => {
    // Left to itself, SheetJS reads a CSV with US conventions: 10/09 would become 9 October,
    // and 01/09 the 9th of January — eight months early, and the priority with it.
    const { anomalies } = await readWorkbook(
      csv(`${CSV_HEADER}\n1;Non;Absent;Pièce;NUIT;Z27575;Z27575;10/09/2026;;A. EXEMPLE\n2;Non;Serrage;Écrou;NUIT;Z27575;Z27575;01/09/2026;;B. EXEMPLE\n`),
      { referenceDate: '2026-09-18' },
    )

    expect(anomalies.map((a) => a.creationDate)).toEqual(['2026-09-10', '2026-09-01'])
    expect(anomalies.map((a) => a.businessDays)).toEqual([6, 13])
  })

  it('leaves a well-formed CSV untouched', async () => {
    const { anomalies } = await readWorkbook(
      csv(`${CSV_HEADER}\n1;Non;Absent;Pièce;NUIT;Z27575;Z27575;10/09/2026;;A. EXEMPLE\n2;Non;Serrage;Écrou;NUIT;Z27575;Z27575;11/09/2026;;B. EXEMPLE\n`),
      { referenceDate: '2026-09-18' },
    )

    expect(anomalies.map((a) => a.number)).toEqual(['1', '2'])
  })
})

describe('readWorkbook — business days', () => {
  const WITHOUT_K = ['Numéro', 'Équipe', 'Rame', 'Date de création']
  const options = { referenceDate: '2026-09-18' }

  it('auto mode: computes from the creation date when column K is missing', async () => {
    const { anomalies, daysSourceCounts } = await readWorkbook(
      workbook([WITHOUT_K, [1, 'NUIT', 'Z27575', 46230], [2, 'NUIT', 'Z27575', '17/09/2026'], [3, 'NUIT', 'Z27575', '2026-09-18T08:30:00']]),
      options,
    )
    expect(anomalies.map((a) => [a.businessDays, a.daysSource, a.priority])).toEqual([
      [39, 'computed', 'blocking'],
      [1, 'computed', 'minor'],
      [0, 'computed', null],
    ])
    expect(daysSourceCounts).toEqual({ file: 0, computed: 3, missing: 0 })
  })

  it('auto mode: the file value wins, the computation fills the empty cells', async () => {
    const { anomalies } = await readWorkbook(
      workbook([[...WITHOUT_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, 2], [2, 'NUIT', 'Z27575', 46230, null]]),
      options,
    )
    expect(anomalies.map((a) => [a.businessDays, a.daysSource])).toEqual([[2, 'file'], [39, 'computed']])
  })

  it('computed mode: ignores the file column', async () => {
    const { anomalies } = await readWorkbook(
      workbook([[...WITHOUT_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, 2]]),
      { ...options, businessDays: 'computed' },
    )
    expect(anomalies[0]).toMatchObject({ businessDays: 39, daysSource: 'computed', priority: 'blocking' })
  })

  it('file mode: never computes', async () => {
    const { anomalies, daysSourceCounts } = await readWorkbook(
      workbook([[...WITHOUT_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, null]]),
      { ...options, businessDays: 'file' },
    )
    expect(anomalies[0]).toMatchObject({ businessDays: null, priority: null })
    expect(daysSourceCounts.missing).toBe(1)
  })

  it('accepts a number written as text, with a decimal comma', async () => {
    const { anomalies } = await readWorkbook(workbook([['Numéro', 'Équipe', 'Rame', 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', ' 4,5 ']]))
    expect(anomalies[0]).toMatchObject({ businessDays: 4.5, priority: 'blocking' })
  })
})

describe('readWorkbook — sheets and errors', () => {
  const ROW = [1, 'Non', 'Absent', 'x', 'NUIT', 'Z27575', 'Z27575', 46282, null, 'A', 1, 'Conforme', 'Mineure']

  it('picks the configured sheet, regardless of accents and case', async () => {
    const { sheet, anomalies } = await readWorkbook(
      multiSheetWorkbook([['Tableau de Bord', [['sans rapport']]], ['DONNEES GLOBALES', [HEADERS, ROW]]]),
      { sheet: 'Données Globales' },
    )
    expect(sheet).toBe('DONNEES GLOBALES')
    expect(anomalies).toHaveLength(1)
  })

  it('falls back to the first sheet, with a warning', async () => {
    const { sheet, warnings } = await readWorkbook(
      multiSheetWorkbook([['Export', [HEADERS, ROW]], ['Notes', [['sans rapport']]]]),
      { sheet: 'Données Globales' },
    )
    expect(sheet).toBe('Export')
    expect(warnings.some((w) => w.includes('introuvable'))).toBe(true)
  })

  it('reads a single-sheet export whatever its name', async () => {
    const { sheet, warnings } = await readWorkbook(workbook([HEADERS], 'Export'), { sheet: 'Données Globales' })
    expect(sheet).toBe('Export')
    expect(warnings.some((w) => w.includes('introuvable'))).toBe(false)
  })

  it('names the missing required columns', async () => {
    await expect(readWorkbook(workbook([['Numéro', 'Libellé', 'Description', 'Rame'], [1, 'a', 'b', 'c']]))).rejects.toThrow(
      /Équipe/,
    )
    await expect(readWorkbook(workbook([['Numéro', 'Équipe', 'Rame', 'Libellé'], [1, 'a', 'b', 'c']]))).rejects.toThrow(
      /Jours Ouvrés Écoulés, Date de création/,
    )
  })

  it('rejects a sheet without a recognizable header row', async () => {
    await expect(readWorkbook(workbook([['a', 'b'], [1, 2]]))).rejects.toBeInstanceOf(ReadError)
  })
})

describe('readDate', () => {
  it.each([
    [46230, '2026-07-27'],
    [46283.75, '2026-09-18'],
    ['18/09/2026', '2026-09-18'],
    ['18/09/2026 14:35', '2026-09-18'],
    ['1/9/26', '2026-09-01'],
    ['2026-09-18', '2026-09-18'],
    ['2026-09-18T07:12:00Z', '2026-09-18'],
    ['31/02/2026', null],
    ['demain', null],
    [null, null],
    [0, null],
  ])('%s → %s', (input, expected) => {
    expect(readDate(input)).toBe(expected)
  })

  it('handles the 1904 calendar of old Mac workbooks', () => {
    expect(readDate(44768, true)).toBe('2026-07-27')
  })
})
