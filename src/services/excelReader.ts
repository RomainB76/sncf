/**
 * Reads the Excel workbook returned by clé (or imported by hand) and turns it into anomalies.
 * This is the equivalent of the « copy/paste into Données Globales » step.
 *
 * Columns are located by their header name, not by their position: the order may change and
 * the computed columns (K, L, M) may be missing without breaking the reading.
 */
import { businessDaysElapsed, isoToday } from '@/domain/businessDays'
import { cleanText, groupingKey, headerKey } from '@/domain/normalization'
import { alertStatusFromDays, priorityFromDays } from '@/domain/priority'
import type { Anomaly, DaysSource } from '@/domain/types'

export type BusinessDaysMode = 'auto' | 'file' | 'computed'

export interface ReadOptions {
  /** Name of the sheet to read; by default (or when not found) the first sheet is used. */
  sheet?: string
  /**
   * Source of « Jours Ouvrés Écoulés » (business days elapsed):
   * - `auto`     : value from the file when present, otherwise computed from the creation date;
   * - `file`     : value from the file only;
   * - `computed` : always recomputed from the creation date.
   */
  businessDays?: BusinessDaysMode
  excludePublicHolidays?: boolean
  /** Reference date of the computation (ISO `YYYY-MM-DD`); today by default. */
  referenceDate?: string
}

export interface ReadResult {
  anomalies: Anomaly[]
  sheet: string
  availableSheets: string[]
  warnings: string[]
  /** Number of anomalies per source of the « Jours Ouvrés Écoulés » value. */
  daysSourceCounts: { file: number; computed: number; missing: number }
}

/** Reading error, with a message meant for the user. */
export class ReadError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'ReadError'
  }
}

type Field =
  | 'number'
  | 'sef'
  | 'label'
  | 'description'
  | 'team'
  | 'trainset'
  | 'vehicle'
  | 'creationDate'
  | 'comment'
  | 'createdBy'
  | 'businessDays'
  | 'alertStatus'

/** Accepted headers for each field (compared after normalization: lower case, no accents). */
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  number: ['numero', 'n', 'no', 'num', 'numero anomalie'],
  sef: ['sef'],
  label: ['libelle', 'libelle de l anomalie'],
  description: ['description'],
  team: ['equipe'],
  trainset: ['rame', 'machine'],
  vehicle: ['vehicule'],
  creationDate: ['date de creation', 'date creation', 'creee le', 'cree le'],
  comment: ['commentaire', 'commentaires'],
  createdBy: ['creee par', 'cree par', 'createur'],
  businessDays: ['jours ouvres ecoules', 'jours ouvres', 'jours ecoules'],
  alertStatus: ['statut alerte takt', 'statut alerte', 'statut takt'],
}

const REQUIRED_FIELDS: readonly Field[] = ['number', 'team', 'trainset']
/** Column names as they appear in the workbook, used in the messages shown to the user. */
const FIELD_LABELS: Record<Field, string> = {
  number: 'Numéro',
  sef: 'SEF',
  label: 'Libellé',
  description: 'Description',
  team: 'Équipe',
  trainset: 'Rame',
  vehicle: 'Véhicule',
  creationDate: 'Date de création',
  comment: 'Commentaire',
  createdBy: 'Créée par',
  businessDays: 'Jours Ouvrés Écoulés',
  alertStatus: 'Statut Alerte Takt',
}

const MS_PER_DAY = 86_400_000
/** Day 0 of the Excel calendar (1900 system) is 1899-12-30. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
const OFFSET_1904 = 1462

type Cell = string | number | boolean | Date | null | undefined
type Columns = Partial<Record<Field, number>>

function detectHeaders(row: readonly Cell[]): Columns {
  const columns: Columns = {}
  row.forEach((cell, index) => {
    const key = headerKey(cell)
    if (key === '') return
    for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
      if (columns[field] === undefined && HEADER_ALIASES[field].includes(key)) {
        columns[field] = index
        return
      }
    }
  })
  return columns
}

/** Looks for the header row among the first rows (tolerates a title above the table). */
function findHeaderRow(rows: readonly Cell[][]): { index: number; columns: Columns } | null {
  let best: { index: number; columns: Columns; score: number } | null = null
  const limit = Math.min(rows.length, 20)
  for (let i = 0; i < limit; i++) {
    const columns = detectHeaders(rows[i] ?? [])
    const score = Object.keys(columns).length
    if (score >= 3 && (best === null || score > best.score)) {
      best = { index: i, columns, score }
    }
  }
  return best
}

function isEmpty(cell: Cell): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')
}

function readText(cell: Cell): string {
  if (isEmpty(cell)) return ''
  if (cell instanceof Date) return cell.toISOString().slice(0, 10)
  return cleanText(cell)
}

/** Multi-line text (description, comment): line breaks are kept. */
function readMultilineText(cell: Cell): string {
  if (isEmpty(cell)) return ''
  return String(cell)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
}

function readAnomalyNumber(cell: Cell): string {
  if (isEmpty(cell)) return ''
  if (typeof cell === 'number' && Number.isFinite(cell)) return String(cell)
  return cleanText(cell)
}

function readNumeric(cell: Cell): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (typeof cell === 'string') {
    const text = cell.trim().replace(/\s/g, '').replace(',', '.')
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  }
  return null
}

function isoFromUtc(t: number): string | null {
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const t = Date.UTC(year, month - 1, day)
  const d = new Date(t)
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return isoFromUtc(t)
}

/** Creation date: Excel serial number, Date object or text (`DD/MM/YYYY`, `YYYY-MM-DD`…). */
export function readDate(cell: Cell, date1904 = false): string | null {
  if (isEmpty(cell)) return null

  if (cell instanceof Date) return isoFromUtc(cell.getTime())

  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell < 1 || cell > 2_958_465) return null
    const days = Math.floor(cell) + (date1904 ? OFFSET_1904 : 0)
    return isoFromUtc(EXCEL_EPOCH + days * MS_PER_DAY)
  }

  if (typeof cell === 'string') {
    const text = cell.trim()
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text)
    if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(text)
    if (fr) {
      const year = Number(fr[3]) < 100 ? 2000 + Number(fr[3]) : Number(fr[3])
      return isoFromParts(year, Number(fr[2]), Number(fr[1]))
    }
  }

  return null
}

const CSV_DELIMITERS = [';', '\t', ','] as const

/**
 * Decodes a UTF-8 CSV, repairing the records the clé export cuts in two.
 *
 * That export never quotes its fields: a description or a comment holding a line break is cut
 * across several physical lines, and every fragment is then read as an extra anomaly. The lines
 * are joined back — a record is complete once it holds as many fields as the header row — and
 * re-emitted as a quoted CSV.
 *
 * Returns `null` for a binary workbook or a content that is not UTF-8 text, which SheetJS then
 * reads as it stands. Decoding here rather than handing over the bytes also keeps the accents
 * of a file without a byte order mark, which SheetJS would otherwise read as latin1.
 */
function csvText(content: Uint8Array): string | null {
  const isZip = content[0] === 0x50 && content[1] === 0x4b // xlsx
  const isOle = content[0] === 0xd0 && content[1] === 0xcf // xls
  if (isZip || isOle) return null

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    return null // not UTF-8 text: leave it to SheetJS
  }
  // Quoted fields mean a well-formed file: nothing to join back.
  if (text.includes('"')) return text

  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const header = lines[0]
  if (header === undefined) return text
  const delimiter = CSV_DELIMITERS.find((d) => header.includes(d))
  if (delimiter === undefined) return text
  const fieldCount = header.split(delimiter).length

  const records: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    const parts = line.split(delimiter)
    if (current.length === 0) {
      current = parts
    } else {
      // The break fell inside the last field: the two halves belong to the same value.
      const last = current.length - 1
      current[last] = `${current[last] ?? ''}\n${parts[0] ?? ''}`
      current.push(...parts.slice(1))
    }
    if (current.length >= fieldCount) {
      records.push(current)
      current = []
    }
  }
  if (current.length > 0) records.push(current)
  if (records.length === lines.length) return text // every line was already a whole record

  return records
    .map((fields) => fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(delimiter))
    .join('\n')
}

/**
 * Reads a workbook (xlsx, xls or csv) and returns the anomalies it contains.
 * @throws ReadError when the file is unreadable or when the expected columns are missing.
 */
export async function readWorkbook(
  content: ArrayBuffer | Uint8Array,
  options: ReadOptions = {},
): Promise<ReadResult> {
  // SheetJS is large: loaded on demand, outside the main bundle.
  const XLSX = await import('xlsx')

  const csv = csvText(content instanceof Uint8Array ? content : new Uint8Array(content))

  let workbook
  try {
    workbook = csv === null
      ? XLSX.read(content, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false })
      : XLSX.read(csv, { type: 'string', cellDates: false, cellFormula: false, cellHTML: false })
  } catch (e) {
    throw new ReadError(
      "Le fichier reçu n'est pas un classeur Excel lisible.",
      e instanceof Error ? e.message : String(e),
    )
  }

  const availableSheets = workbook.SheetNames
  if (availableSheets.length === 0) {
    throw new ReadError('Le classeur ne contient aucune feuille.')
  }

  const warnings: string[] = []
  const firstSheet = availableSheets[0] as string
  let sheetName = firstSheet
  if (options.sheet) {
    const wanted = groupingKey(options.sheet)
    const found = availableSheets.find((name) => groupingKey(name) === wanted)
    if (found) sheetName = found
    else if (availableSheets.length > 1) {
      warnings.push(
        `Feuille « ${options.sheet} » introuvable : lecture de la première feuille (« ${firstSheet} »).`,
      )
    }
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet || !sheet['!ref']) {
    throw new ReadError(`La feuille « ${sheetName} » est vide.`)
  }

  const firstRow = XLSX.utils.decode_range(sheet['!ref']).s.r
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  })

  const headers = findHeaderRow(rows)
  if (!headers) {
    const preview = (rows[0] ?? []).filter((c) => !isEmpty(c)).slice(0, 8).join(' | ')
    throw new ReadError(
      `Aucune ligne d'en-tête reconnue dans la feuille « ${sheetName} ».`,
      `Colonnes attendues : ${Object.values(FIELD_LABELS).join(', ')}. Première ligne lue : ${preview || '(vide)'}`,
    )
  }

  const { columns } = headers
  const missing = REQUIRED_FIELDS.filter((field) => columns[field] === undefined)
  if (columns.businessDays === undefined && columns.creationDate === undefined) {
    missing.push('businessDays', 'creationDate')
  }
  if (missing.length > 0) {
    throw new ReadError(
      `Colonne(s) introuvable(s) dans la feuille « ${sheetName} » : ${missing.map((field) => FIELD_LABELS[field]).join(', ')}.`,
      'Les colonnes sont repérées par leur nom d’en-tête (accents et majuscules indifférents).',
    )
  }

  const mode: BusinessDaysMode = options.businessDays ?? 'auto'
  const excludeHolidays = options.excludePublicHolidays ?? true
  const referenceDate = options.referenceDate ?? isoToday()
  const date1904 = workbook.Workbook?.WBProps?.date1904 === true

  if (mode === 'file' && columns.businessDays === undefined) {
    warnings.push(
      'La colonne « Jours Ouvrés Écoulés » est absente du fichier alors que la configuration impose de l’utiliser : aucune priorité ne peut être calculée.',
    )
  }
  if (mode === 'computed' && columns.creationDate === undefined) {
    warnings.push(
      'La colonne « Date de création » est absente du fichier alors que la configuration impose de recalculer les jours ouvrés : aucune priorité ne peut être calculée.',
    )
  }

  const cellOf = (row: readonly Cell[], field: Field): Cell => {
    const index = columns[field]
    return index === undefined ? null : row[index]
  }

  const anomalies: Anomaly[] = []
  const daysSourceCounts = { file: 0, computed: 0, missing: 0 }

  for (let i = headers.index + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(isEmpty)) continue

    const team = readText(cellOf(row, 'team'))
    const trainset = readText(cellOf(row, 'trainset'))
    const creationDate = readDate(cellOf(row, 'creationDate'), date1904)

    let businessDays: number | null = null
    let source: DaysSource | null = null
    if (mode !== 'computed') {
      businessDays = readNumeric(cellOf(row, 'businessDays'))
      if (businessDays !== null) source = 'file'
    }
    if (businessDays === null && mode !== 'file' && creationDate !== null) {
      businessDays = businessDaysElapsed(creationDate, referenceDate, excludeHolidays)
      if (businessDays !== null) source = 'computed'
    }
    daysSourceCounts[source ?? 'missing'] += 1

    const fileStatus = readText(cellOf(row, 'alertStatus'))

    anomalies.push({
      row: firstRow + i + 1,
      number: readAnomalyNumber(cellOf(row, 'number')),
      sef: readText(cellOf(row, 'sef')),
      label: readText(cellOf(row, 'label')),
      description: readMultilineText(cellOf(row, 'description')),
      team,
      teamKey: groupingKey(team),
      trainset,
      trainsetKey: groupingKey(trainset),
      vehicle: readText(cellOf(row, 'vehicle')),
      creationDate,
      comment: readMultilineText(cellOf(row, 'comment')),
      createdBy: readText(cellOf(row, 'createdBy')),
      businessDays,
      daysSource: source,
      alertStatus: source === 'file' && fileStatus !== '' ? fileStatus : alertStatusFromDays(businessDays),
      // Column M of the workbook: always recomputed, exactly like the Excel formula.
      priority: priorityFromDays(businessDays),
    })
  }

  if (anomalies.length === 0) {
    warnings.push(`La feuille « ${sheetName} » ne contient aucune ligne de données.`)
  }

  return { anomalies, sheet: sheetName, availableSheets, warnings, daysSourceCounts }
}
