/**
 * Prepares the data set of the mock clé API (mock/cle-export.xlsx).
 *
 *   npm run mock:import -- "C:\path\to\workbook.xlsx"
 *
 * Accepts the full tracking workbook as well as a raw clé export: only the data sheet is kept
 * (« Données Globales », or the first sheet), and the formulas are replaced by their values —
 * what the API would return.
 *
 * The produced file contains real data (names of agents): it is ignored by git.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const DATA_SHEET = 'Données Globales'

const source = process.argv[2]
if (!source) {
  console.error('Usage: npm run mock:import -- "<path to the .xlsx workbook>"')
  process.exit(1)
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(rootDir, 'mock', 'cle-export.xlsx')

let workbook
try {
  workbook = XLSX.read(readFileSync(path.resolve(source)), { type: 'buffer', cellDates: false })
} catch (e) {
  console.error(`Cannot read: ${source}\n${e instanceof Error ? e.message : e}`)
  process.exit(1)
}

const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
const sheetName = workbook.SheetNames.find((n) => normalize(n) === normalize(DATA_SHEET)) ?? workbook.SheetNames[0]
const sheet = workbook.Sheets[sheetName]

// Values only: the formulas are removed (the « Priorité » column of the workbook is one).
let formulaCount = 0
for (const [address, cell] of Object.entries(sheet)) {
  if (address.startsWith('!') || typeof cell !== 'object' || cell === null) continue
  if ('f' in cell) {
    delete cell.f
    formulaCount += 1
  }
}
delete sheet['!autofilter']

const output = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(output, sheet, sheetName)

mkdirSync(path.dirname(target), { recursive: true })
writeFileSync(target, XLSX.write(output, { type: 'buffer', bookType: 'xlsx', compression: true }))

const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
console.log(`Sheet "${sheetName}": ${range.e.r - range.s.r} data rows, ${formulaCount} formulas frozen.`)
console.log(`Written: ${path.relative(rootDir, target)}`)
