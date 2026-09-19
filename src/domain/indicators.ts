/**
 * Indicators computation — transcription of the Excel workbook formulas.
 *
 * Each function cites the original formula. They are pure functions: same input data,
 * same figures as Excel (see tests/excel-conformity.test.ts).
 */
import { cleanText, groupingKey, isPlausibleLabel, slugify } from './normalization'
import { isInAlert } from './priority'
import type {
  Anomaly,
  Breakdown,
  GlobalIndicators,
  Priority,
  Reference,
  SummaryRow,
  Team,
  TeamAnalysis,
  TeamsSummary,
} from './types'

export function emptyBreakdown(): Breakdown {
  return { minor: 0, major: 0, blocking: 0, total: 0 }
}

function count(breakdown: Breakdown, priority: Priority): void {
  breakdown[priority] += 1
  breakdown.total += 1
}

function add(target: Breakdown, source: Breakdown): void {
  target.minor += source.minor
  target.major += source.major
  target.blocking += source.blocking
  target.total += source.total
}

/**
 * Headline indicators of the « Tableau de Bord » sheet (cells A4, C4, E4, G4 and I4).
 */
export function globalIndicators(anomalies: readonly Anomaly[]): GlobalIndicators {
  const result: GlobalIndicators = {
    totalAnomalies: 0,
    blocking: 0,
    major: 0,
    minor: 0,
    alertOver4Days: 0,
  }

  for (const a of anomalies) {
    // =NBVAL('Données Globales'!A:A)-1: every row whose « Numéro » column is filled in.
    if (a.number !== '') result.totalAnomalies += 1
    // =NB.SI('Données Globales'!M:M; "Bloquante" | "Majeure" | "Mineure")
    if (a.priority === 'blocking') result.blocking += 1
    else if (a.priority === 'major') result.major += 1
    else if (a.priority === 'minor') result.minor += 1
    // =NB.SI('Données Globales'!K:K; ">4")
    if (isInAlert(a.businessDays)) result.alertOver4Days += 1
  }

  return result
}

/**
 * « Synthèse par Équipe » table (Tableau de Bord, A8:E19).
 *
 *   =NB.SI.ENS('Données Globales'!$E:$E; <team>; 'Données Globales'!$M:$M; <priority>)
 *   Total = SOMME(B:D); Total Général = sum of the rows.
 */
export function summaryByTeam(
  anomalies: readonly Anomaly[],
  teams: readonly Reference[],
): TeamsSummary {
  const rows = new Map<string, SummaryRow>()
  for (const team of teams) {
    rows.set(team.key, { key: team.key, label: team.label, ...emptyBreakdown() })
  }

  let outsideSummary = 0
  for (const a of anomalies) {
    if (a.priority === null) continue
    const row = rows.get(a.teamKey)
    if (row) count(row, a.priority)
    else outsideSummary += 1
  }

  const grandTotal = emptyBreakdown()
  for (const row of rows.values()) add(grandTotal, row)

  return { rows: [...rows.values()], grandTotal, outsideSummary }
}

/**
 * « Machine × criticité » table of a team sheet (A3:E8).
 *
 *   =NB.SI.ENS('Données Globales'!E:E; <team>; 'Données Globales'!F:F; <trainset>; 'Données Globales'!M:M; <priority>)
 */
export function teamAnalysis(
  anomalies: readonly Anomaly[],
  teamKey: string,
  machines: readonly Reference[],
): TeamAnalysis {
  const rows = new Map<string, SummaryRow>()
  for (const machine of machines) {
    rows.set(machine.key, { key: machine.key, label: machine.label, ...emptyBreakdown() })
  }

  let outsideTable = 0
  for (const a of anomalies) {
    if (a.teamKey !== teamKey || a.priority === null) continue
    const row = rows.get(a.trainsetKey)
    if (row) count(row, a.priority)
    else outsideTable += 1
  }

  const total = emptyBreakdown()
  for (const row of rows.values()) add(total, row)

  return { rows: [...rows.values()], total, outsideTable }
}

/**
 * Reference list: first the configured ones (workbook order, displayed even at zero), then
 * those discovered in the data. Excel silently ignored a new team or trainset until its row
 * was added by hand; here it shows up automatically.
 */
function mergeReferences(
  configured: readonly string[],
  dataValues: Iterable<string>,
): Reference[] {
  const result = new Map<string, Reference>()

  for (const label of configured) {
    const key = groupingKey(label)
    if (key !== '' && !result.has(key)) result.set(key, { key, label: cleanText(label) })
  }

  const discovered = new Set<string>()
  for (const key of dataValues) {
    if (key !== '' && !result.has(key) && isPlausibleLabel(key)) discovered.add(key)
  }
  for (const key of [...discovered].sort((a, b) => a.localeCompare(b, 'fr'))) {
    result.set(key, { key, label: key })
  }

  return [...result.values()]
}

/** Teams = one page per team (the equivalent of the AFFAIRES … PIECES DEPOSEES sheets). */
export function listTeams(
  anomalies: readonly Anomaly[],
  configuredTeams: readonly string[],
): Team[] {
  const references = mergeReferences(
    configuredTeams,
    anomalies.map((a) => a.teamKey),
  )

  const takenSlugs = new Set<string>()
  return references.map((ref) => {
    const base = slugify(ref.label) || 'team'
    let candidate = base
    for (let i = 2; takenSlugs.has(candidate); i++) candidate = `${base}-${i}`
    takenSlugs.add(candidate)
    return { ...ref, slug: candidate }
  })
}

/** Machines (trainsets) listed in every team table. */
export function listMachines(
  anomalies: readonly Anomaly[],
  configuredMachines: readonly string[],
): Reference[] {
  return mergeReferences(
    configuredMachines,
    anomalies.map((a) => a.trainsetKey),
  )
}
