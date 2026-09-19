import type { Priority } from './types'

/** Takt alert threshold: beyond 4 business days, the anomaly is blocking. */
export const ALERT_THRESHOLD_DAYS = 4

/**
 * Priority of an anomaly — exact transcription of column M of the workbook:
 *
 *   =SI(K2>4; "Bloquante"; SI(K2>=3; "Majeure"; SI(K2>=1; "Mineure"; "")))
 *
 * An empty K cell is worth 0 in Excel: the formula then returns "" (here `null`).
 */
export function priorityFromDays(businessDays: number | null): Priority | null {
  if (businessDays === null || Number.isNaN(businessDays)) return null
  if (businessDays > ALERT_THRESHOLD_DAYS) return 'blocking'
  if (businessDays >= 3) return 'major'
  if (businessDays >= 1) return 'minor'
  return null
}

/**
 * Takt alert status (column L), used when the file does not provide it.
 * In the workbook: « 🚨 >4j Jours Ouvrés » beyond the threshold, « Conforme » otherwise.
 */
export function alertStatusFromDays(businessDays: number | null): string {
  if (businessDays === null) return ''
  return businessDays > ALERT_THRESHOLD_DAYS ? '>4j Jours Ouvrés' : 'Conforme'
}

/** `true` when the anomaly exceeds the alert threshold — the `NB.SI(K:K;">4")` criterion. */
export function isInAlert(businessDays: number | null): boolean {
  return businessDays !== null && businessDays > ALERT_THRESHOLD_DAYS
}
