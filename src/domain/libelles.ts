import type { Priorite } from './types'

export interface LibellePriorite {
  /** Nom de la priorité, tel qu'écrit par la formule Excel. */
  nom: Priorite
  /** Pluriel utilisé par les indicateurs de tête (« Bloquantes », « Majeures », « Mineures »). */
  pluriel: string
  /** Seuil en jours ouvrés, conforme à la formule de la colonne M. */
  seuil: string
  /** En-tête de colonne d'origine dans le classeur. */
  enTeteExcel: string
  /** Suffixe de classe CSS (`pastille--bloquante`…). */
  classe: 'mineure' | 'majeure' | 'bloquante'
}

export const LIBELLES_PRIORITE: Record<Priorite, LibellePriorite> = {
  Mineure: {
    nom: 'Mineure',
    pluriel: 'Mineures',
    seuil: '1 à 2 j ouvrés',
    enTeteExcel: 'Mineure ≤2j',
    classe: 'mineure',
  },
  Majeure: {
    nom: 'Majeure',
    pluriel: 'Majeures',
    seuil: '3 à 4 j ouvrés',
    enTeteExcel: 'Majeure 3≤4',
    classe: 'majeure',
  },
  Bloquante: {
    nom: 'Bloquante',
    pluriel: 'Bloquantes',
    seuil: '> 4 j ouvrés',
    enTeteExcel: 'Bloquante >4j Jours Ouvrés',
    classe: 'bloquante',
  },
}

const formatEntier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const formatPart = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

export function entier(valeur: number): string {
  return formatEntier.format(valeur)
}

/** Part d'un total, en pourcentage entier (« 57 % »). Renvoie « – » si le total est nul. */
export function part(valeur: number, total: number): string {
  return total > 0 ? formatPart.format(valeur / total) : '–'
}

const formatDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

/** Date ISO `AAAA-MM-JJ` → `JJ/MM/AAAA`. */
export function dateCourte(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '–' : formatDate.format(d)
}
