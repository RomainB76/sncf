import type { Priority } from './types'

/** Display texts of a priority (the interface is in French). */
export interface PriorityLabel {
  /** Priority name, exactly as written by the Excel formula. */
  name: string
  /** Plural used by the headline indicators (« Bloquantes », « Majeures », « Mineures »). */
  plural: string
  /** Threshold in business days, matching the column M formula. */
  threshold: string
  /** Original column header in the workbook. */
  excelHeader: string
}

export const PRIORITY_LABELS: Record<Priority, PriorityLabel> = {
  minor: {
    name: 'Mineure',
    plural: 'Mineures',
    threshold: '1 à 2 j ouvrés',
    excelHeader: 'Mineure ≤2j',
  },
  major: {
    name: 'Majeure',
    plural: 'Majeures',
    threshold: '3 à 4 j ouvrés',
    excelHeader: 'Majeure 3≤4',
  },
  blocking: {
    name: 'Bloquante',
    plural: 'Bloquantes',
    threshold: '> 4 j ouvrés',
    excelHeader: 'Bloquante >4j Jours Ouvrés',
  },
}

const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const shareFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

export function formatInteger(value: number): string {
  return integerFormat.format(value)
}

/** Share of a total, as a whole percentage (« 57 % »). Returns « – » when the total is zero. */
export function formatShare(value: number, total: number): string {
  return total > 0 ? shareFormat.format(value / total) : '–'
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

/** ISO `YYYY-MM-DD` date → `DD/MM/YYYY`. */
export function formatShortDate(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '–' : dateFormat.format(d)
}
