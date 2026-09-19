/**
 * Domain model of the anomaly tracking.
 *
 * The vocabulary follows the original Excel workbook (sheet « Données Globales »).
 */

/** Priority of an anomaly, as computed by column M of the workbook (Mineure / Majeure / Bloquante). */
export type Priority = 'minor' | 'major' | 'blocking'

/** Column order of the Excel tables: Mineure, Majeure, Bloquante. */
export const PRIORITIES: readonly Priority[] = ['minor', 'major', 'blocking']

/** Where the « Jours Ouvrés Écoulés » (business days elapsed) value of an anomaly comes from. */
export type DaysSource = 'file' | 'computed'

/** One row of the « Données Globales » sheet. */
export interface Anomaly {
  /** Row number in the source file (1 = header), useful for diagnostics. */
  row: number
  number: string
  sef: string
  label: string
  description: string
  /** Team as written in the file (may contain stray spaces). */
  team: string
  /** Normalized team, used for every grouping. */
  teamKey: string
  trainset: string
  trainsetKey: string
  vehicle: string
  /** Creation date as ISO `YYYY-MM-DD`, or `null` when missing or unreadable. */
  creationDate: string | null
  comment: string
  createdBy: string
  /** Column K: business days elapsed since creation. */
  businessDays: number | null
  daysSource: DaysSource | null
  /** Column L: Takt alert status. */
  alertStatus: string
  /** Column M: priority derived from the business days (`null` = empty cell in Excel). */
  priority: Priority | null
}

/** Count per priority. `total` = minor + major + blocking, like `SOMME(B:D)` in Excel. */
export interface Breakdown {
  minor: number
  major: number
  blocking: number
  total: number
}

/** One row of a summary table (a team or a machine). */
export interface SummaryRow extends Breakdown {
  /** Normalized key of the team or machine. */
  key: string
  label: string
}

/** The five headline indicators of the « Tableau de Bord » sheet. */
export interface GlobalIndicators {
  /** `NBVAL('Données Globales'!A:A)-1` */
  totalAnomalies: number
  /** `NB.SI('Données Globales'!M:M;"Bloquante")` */
  blocking: number
  /** `NB.SI('Données Globales'!M:M;"Majeure")` */
  major: number
  /** `NB.SI('Données Globales'!M:M;"Mineure")` */
  minor: number
  /** `NB.SI('Données Globales'!K:K;">4")` */
  alertOver4Days: number
}

/** Category breakdown table of the dashboard: « Synthèse par Équipe » or « Synthèse par Machine ». */
export interface CategorySummary {
  rows: SummaryRow[]
  /** « Total Général » row: sum of the listed rows. */
  grandTotal: Breakdown
  /**
   * Prioritized anomalies whose category (team or machine) is not recognized: they count in the
   * headline indicators but in no row of the table (same behaviour as Excel).
   */
  outsideSummary: number
}

/** « Machine × criticité » table of a team sheet. */
export interface TeamAnalysis {
  rows: SummaryRow[]
  /** « Total » row. */
  total: Breakdown
  /** Prioritized anomalies of the team whose trainset is not recognized (absent from the table). */
  outsideTable: number
}

/** Reference to a team or a machine: grouping key + displayed label. */
export interface Reference {
  key: string
  label: string
}

/** Navigable team: one page per team, like one sheet per team in Excel. */
export interface Team extends Reference {
  /** URL segment (`/team/montage-1`). */
  slug: string
}
