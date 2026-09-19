/**
 * Label normalization.
 *
 * In the workbook, the NB.SI.ENS criteria are case-insensitive but whitespace-sensitive: the
 * export contains « MONTAGE 1␣␣ » (two trailing spaces), « Peinture », « Chaudro »… and every
 * formula had to be adjusted by hand. Here, every grouping goes through a normalized key, which
 * gives the same results without depending on those details.
 */

/** Removes diacritics (é → e). */
function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Grouping key: no accents, upper case, whitespace collapsed and trimmed. */
export function groupingKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  return stripAccents(String(value)).toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Column header key: lower case, no accents nor punctuation. */
export function headerKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  return stripAccents(String(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** URL segment: « PIECES DEPOSEES » → « pieces-deposees ». */
export function slugify(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Display text: whitespace collapsed and trimmed, original case kept. */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[ \t]+/g, ' ').trim()
}

/**
 * A team or machine label discovered in the data is only kept when it contains at least one
 * letter. This discards values shifted by a fragmented row (for instance a date that landed
 * in the Team column).
 */
export function isPlausibleLabel(key: string): boolean {
  return /[A-Z]/.test(key)
}
