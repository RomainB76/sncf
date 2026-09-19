/**
 * Strict conformity with the original Excel workbook.
 *
 * The reference workbook contains, for every formula, the value computed by Excel.
 * This test reads its « Données Globales » sheet with the application pipeline, recomputes
 * every indicator, then compares cell by cell with the Excel values:
 *   - Tableau de Bord: A4, C4, E4, G4, I4, table B9:E18 and the « Total Général » row;
 *   - each team sheet: table B4:E7 and the « Total » row.
 *
 * The test is generic: replace tests/fixtures/reference-workbook.xlsx with a newer version of
 * the workbook, it stays valid. The file contains real data and is not versioned; when it is
 * missing, the test is skipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { globalIndicators, listTeams, summaryByTeam, teamAnalysis } from '@/domain/indicators'
import { PRIORITY_LABELS } from '@/domain/labels'
import { groupingKey } from '@/domain/normalization'
import { PRIORITIES, type Anomaly, type Reference } from '@/domain/types'
import { readWorkbook } from '@/services/excelReader'

const FIXTURE = fileURLToPath(new URL('./fixtures/reference-workbook.xlsx', import.meta.url))
const available = existsSync(FIXTURE)

const COLUMNS = { minor: 'B', major: 'C', blocking: 'D', total: 'E' } as const

function numberAt(sheet: XLSX.WorkSheet, address: string): number {
  const cell = sheet[address] as XLSX.CellObject | undefined
  if (!cell || typeof cell.v !== 'number') throw new Error(`Numeric value expected at ${address}`)
  return cell.v
}

function textAt(sheet: XLSX.WorkSheet, address: string): string {
  const cell = sheet[address] as XLSX.CellObject | undefined
  return cell ? String(cell.v) : ''
}

function reference(label: string): Reference {
  return { key: groupingKey(label), label }
}

describe.skipIf(!available)('Conformity with the Excel workbook', () => {
  let workbook: XLSX.WorkBook
  let anomalies: Anomaly[]

  beforeAll(async () => {
    const content = readFileSync(FIXTURE)
    workbook = XLSX.read(content, { type: 'buffer' })
    // « file » mode: column K is taken as Excel sees it, nothing is recomputed.
    const result = await readWorkbook(new Uint8Array(content), { sheet: 'Données Globales', businessDays: 'file' })
    anomalies = result.anomalies
  })

  it('reads the « Données Globales » sheet', () => {
    expect(anomalies.length).toBeGreaterThan(0)
  })

  it('reproduces the 5 headline indicators of the Tableau de Bord', () => {
    const dashboard = workbook.Sheets['Tableau de Bord']!
    const computed = globalIndicators(anomalies)

    expect(computed.totalAnomalies, 'A4 Total Anomalies').toBe(numberAt(dashboard, 'A4'))
    expect(computed.blocking, 'C4 Bloquantes').toBe(numberAt(dashboard, 'C4'))
    expect(computed.major, 'E4 Majeures').toBe(numberAt(dashboard, 'E4'))
    expect(computed.minor, 'G4 Mineures').toBe(numberAt(dashboard, 'G4'))
    expect(computed.alertOver4Days, 'I4 ALERTE >4 jours').toBe(numberAt(dashboard, 'I4'))
  })

  it('reproduces the « Synthèse par Équipe » table and its « Total Général »', () => {
    const dashboard = workbook.Sheets['Tableau de Bord']!
    const excelRows: number[] = []
    for (let r = 9; textAt(dashboard, `A${r}`) !== '' && groupingKey(textAt(dashboard, `A${r}`)) !== 'TOTAL GENERAL'; r++) {
      excelRows.push(r)
    }
    expect(excelRows.length).toBeGreaterThan(0)

    const teams = excelRows.map((r) => reference(textAt(dashboard, `A${r}`)))
    const summary = summaryByTeam(anomalies, teams)

    excelRows.forEach((r, i) => {
      const row = summary.rows[i]!
      for (const [field, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
        expect(row[field], `${row.label} / ${field} (${column}${r})`).toBe(numberAt(dashboard, `${column}${r}`))
      }
    })

    const totalRow = excelRows[excelRows.length - 1]! + 1
    for (const [field, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
      expect(summary.grandTotal[field], `Total Général / ${field}`).toBe(numberAt(dashboard, `${column}${totalRow}`))
    }
  })

  it('explains the Excel gap between « Total Anomalies » and « Total Général »', () => {
    // In the workbook, A4 (every row) exceeds the « Total Général » (rows attached to a team).
    // The application must attribute this gap, row for row, to the « outside summary » anomalies.
    const dashboard = workbook.Sheets['Tableau de Bord']!
    let totalRow = 9
    while (groupingKey(textAt(dashboard, `A${totalRow}`)) !== 'TOTAL GENERAL') totalRow++
    const excelTeams = Array.from({ length: totalRow - 9 }, (_, i) => reference(textAt(dashboard, `A${9 + i}`)))

    const summary = summaryByTeam(anomalies, excelTeams)
    const unprioritized = anomalies.filter((a) => a.number !== '' && a.priority === null).length

    expect(summary.outsideSummary + unprioritized).toBe(numberAt(dashboard, 'A4') - numberAt(dashboard, `E${totalRow}`))
  })

  it('discovers no spurious team in the fragmented rows', () => {
    // A date that landed in the Team column must not become a « 46275 » page.
    for (const team of listTeams(anomalies, [])) {
      expect(team.key).toMatch(/[A-Z]/)
    }
  })

  it('reproduces the « Machine × criticité » table of each team sheet', () => {
    const teamSheets = workbook.SheetNames.filter(
      (name) => textAt(workbook.Sheets[name]!, 'A1').startsWith('Analyse Équipe'),
    )
    expect(teamSheets.length).toBeGreaterThan(0)

    for (const sheetName of teamSheets) {
      const sheet = workbook.Sheets[sheetName]!
      const excelRows: number[] = []
      for (let r = 4; textAt(sheet, `A${r}`) !== '' && groupingKey(textAt(sheet, `A${r}`)) !== 'TOTAL'; r++) {
        excelRows.push(r)
      }
      const machines = excelRows.map((r) => reference(textAt(sheet, `A${r}`)))
      const analysis = teamAnalysis(anomalies, groupingKey(sheetName), machines)

      excelRows.forEach((r, i) => {
        const row = analysis.rows[i]!
        for (const priority of PRIORITIES) {
          expect(row[priority], `${sheetName} / ${row.label} / ${priority}`).toBe(
            numberAt(sheet, `${COLUMNS[priority]}${r}`),
          )
        }
        expect(row.total, `${sheetName} / ${row.label} / Total`).toBe(numberAt(sheet, `E${r}`))
      })

      const totalRow = excelRows[excelRows.length - 1]! + 1
      for (const [field, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
        expect(analysis.total[field], `${sheetName} / Total / ${field}`).toBe(numberAt(sheet, `${column}${totalRow}`))
      }
    }
  })

  it('recomputes the « Priorité » column identically to the Excel formula', () => {
    const data = workbook.Sheets['Données Globales']!
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(data, { defval: null })
    const excelPriorities = rows.map((r) => (r['Priorité'] === null || r['Priorité'] === '' ? null : String(r['Priorité'])))
    expect(anomalies.map((a) => (a.priority ? PRIORITY_LABELS[a.priority].name : null))).toEqual(excelPriorities)
  })
})
