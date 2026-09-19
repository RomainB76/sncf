/**
 * Normalisation des libellés.
 *
 * Dans le classeur, les critères des NB.SI.ENS sont insensibles à la casse mais sensibles
 * aux espaces : l'export contient « MONTAGE 1␣␣ » (deux espaces finaux), « Peinture »,
 * « Chaudro »… et chaque formule a dû être ajustée à la main. Ici, tous les regroupements
 * passent par une clé normalisée, ce qui donne les mêmes résultats sans dépendre de ces détails.
 */

/** Supprime les accents (é → e). */
function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Clé de regroupement : sans accents, en majuscules, espaces réduits et rognés. */
export function cleDeRegroupement(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ''
  return sansAccents(String(valeur)).toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Clé d'en-tête de colonne : minuscules, sans accents ni ponctuation. */
export function cleEnTete(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ''
  return sansAccents(String(valeur))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Segment d'URL : « PIECES DEPOSEES » → « pieces-deposees ». */
export function slug(valeur: string): string {
  return sansAccents(valeur)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Texte d'affichage : espaces réduits et rognés, casse d'origine conservée. */
export function texteNettoye(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return ''
  return String(valeur).replace(/[ \t]+/g, ' ').trim()
}

/**
 * Un libellé d'équipe ou de machine découvert dans les données n'est retenu que s'il
 * contient au moins une lettre. Cela écarte les valeurs décalées par une ligne fragmentée
 * (par exemple une date tombée dans la colonne Équipe).
 */
export function estLibellePlausible(cle: string): boolean {
  return /[A-Z]/.test(cle)
}
