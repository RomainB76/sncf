/**
 * Business days computation.
 *
 * Fallback used when the received file lacks the « Jours Ouvrés Écoulés » column: the
 * application then recomputes it from the « Date de création » column.
 *
 * Every date is handled as a day number (days since 1970-01-01, UTC), which avoids any
 * shift due to time zones or daylight saving changes.
 */

const MS_PER_DAY = 86_400_000

/** Day number of an ISO `YYYY-MM-DD` date, or `null` when the format is invalid. */
export function dayFromIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const t = Date.UTC(year, month - 1, day)
  const d = new Date(t)
  // Rejects impossible dates (Feb 31…) that Date.UTC would silently roll over.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return Math.round(t / MS_PER_DAY)
}

/** ISO `YYYY-MM-DD` date of a day number. */
export function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10)
}

/** ISO date of the current day, in the user's time zone. */
export function isoToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7
}

function isWeekend(day: number): boolean {
  const wd = weekday(day)
  return wd === 0 || wd === 6
}

/** Easter Sunday (Meeus/Jones/Butcher algorithm, Gregorian calendar). */
function easterDay(year: number): number {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

const holidayCache = new Map<number, number[]>()

/** Legal public holidays in metropolitan France for a year (day numbers). */
export function frenchPublicHolidays(year: number): number[] {
  const known = holidayCache.get(year)
  if (known) return known

  const fixed = (month: number, day: number) => Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY)
  const easter = easterDay(year)
  const holidays = [
    fixed(1, 1), // New Year's Day
    easter + 1, // Easter Monday
    fixed(5, 1), // Labour Day
    fixed(5, 8), // Victory in Europe Day
    easter + 39, // Ascension
    easter + 50, // Whit Monday
    fixed(7, 14), // Bastille Day
    fixed(8, 15), // Assumption
    fixed(11, 1), // All Saints' Day
    fixed(11, 11), // Armistice Day
    fixed(12, 25), // Christmas
  ].sort((x, y) => x - y)

  holidayCache.set(year, holidays)
  return holidays
}

/**
 * Number of business days between two days, bounds included.
 * Equivalent of `NB.JOURS.OUVRES(debut; fin; feries)` (NETWORKDAYS) in Excel.
 */
export function countBusinessDays(start: number, end: number, excludeHolidays: boolean): number {
  if (end < start) return 0

  const dayCount = end - start + 1
  const fullWeeks = Math.floor(dayCount / 7)
  let total = fullWeeks * 5
  for (let day = start + fullWeeks * 7; day <= end; day++) {
    if (!isWeekend(day)) total++
  }

  if (excludeHolidays) {
    const startYear = new Date(start * MS_PER_DAY).getUTCFullYear()
    const endYear = new Date(end * MS_PER_DAY).getUTCFullYear()
    for (let year = startYear; year <= endYear; year++) {
      for (const holiday of frenchPublicHolidays(year)) {
        if (holiday >= start && holiday <= end && !isWeekend(holiday)) total--
      }
    }
  }

  return total
}

/**
 * Business days elapsed since the creation of an anomaly.
 *
 * The creation day counts for 0: an anomaly created on a Friday is worth 1 on the following
 * Monday. That is `NB.JOURS.OUVRES(création; aujourd'hui) - 1`, floored at 0.
 */
export function businessDaysElapsed(
  creationDateIso: string,
  referenceDateIso: string,
  excludeHolidays: boolean,
): number | null {
  const start = dayFromIso(creationDateIso)
  const end = dayFromIso(referenceDateIso)
  if (start === null || end === null) return null
  if (end < start) return 0
  return Math.max(0, countBusinessDays(start, end, excludeHolidays) - 1)
}
