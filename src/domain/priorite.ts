import type { Priorite } from './types'

/** Seuil de l'alerte Takt : au-delà de 4 jours ouvrés, l'anomalie est bloquante. */
export const SEUIL_ALERTE_JOURS = 4

/**
 * Priorité d'une anomalie — transcription exacte de la colonne M du classeur :
 *
 *   =SI(K2>4; "Bloquante"; SI(K2>=3; "Majeure"; SI(K2>=1; "Mineure"; "")))
 *
 * Une cellule K vide vaut 0 dans Excel : la formule renvoie alors "" (ici `null`).
 */
export function prioriteDepuisJours(joursOuvres: number | null): Priorite | null {
  if (joursOuvres === null || Number.isNaN(joursOuvres)) return null
  if (joursOuvres > SEUIL_ALERTE_JOURS) return 'Bloquante'
  if (joursOuvres >= 3) return 'Majeure'
  if (joursOuvres >= 1) return 'Mineure'
  return null
}

/**
 * Statut d'alerte Takt (colonne L), utilisé quand le fichier ne le fournit pas.
 * Dans le classeur : « 🚨 >4j Jours Ouvrés » au-delà du seuil, « Conforme » sinon.
 */
export function statutAlerteDepuisJours(joursOuvres: number | null): string {
  if (joursOuvres === null) return ''
  return joursOuvres > SEUIL_ALERTE_JOURS ? '>4j Jours Ouvrés' : 'Conforme'
}

/** `true` si l'anomalie dépasse le seuil d'alerte — critère de `NB.SI(K:K;">4")`. */
export function estEnAlerte(joursOuvres: number | null): boolean {
  return joursOuvres !== null && joursOuvres > SEUIL_ALERTE_JOURS
}
