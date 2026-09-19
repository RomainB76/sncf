import { describe, expect, it } from 'vitest'
import {
  businessDaysElapsed,
  countBusinessDays,
  dayFromIso,
  frenchPublicHolidays,
  isoFromDay,
} from '@/domain/businessDays'

const day = (iso: string) => dayFromIso(iso)!

describe('dates', () => {
  it('converts both ways', () => {
    expect(isoFromDay(day('2026-09-18'))).toBe('2026-09-18')
    expect(dayFromIso('1970-01-01')).toBe(0)
  })

  it('rejects impossible or malformed dates', () => {
    expect(dayFromIso('2026-02-31')).toBeNull()
    expect(dayFromIso('18/09/2026')).toBeNull()
  })
})

describe('frenchPublicHolidays', () => {
  it('computes the movable feasts of 2026 (Easter on April 5)', () => {
    const holidays = frenchPublicHolidays(2026).map(isoFromDay)
    expect(holidays).toContain('2026-04-06') // Easter Monday
    expect(holidays).toContain('2026-05-14') // Ascension
    expect(holidays).toContain('2026-05-25') // Whit Monday
    expect(holidays).toHaveLength(11)
  })

  it('computes Easter for other years', () => {
    expect(frenchPublicHolidays(2025).map(isoFromDay)).toContain('2025-04-21')
    expect(frenchPublicHolidays(2027).map(isoFromDay)).toContain('2027-03-29')
  })
})

describe('countBusinessDays — equivalent of NB.JOURS.OUVRES', () => {
  it('counts the bounds included, without the weekends', () => {
    // From Monday 2026-07-27 to Friday 2026-09-18: 8 full weeks.
    expect(countBusinessDays(day('2026-07-27'), day('2026-09-18'), false)).toBe(40)
    expect(countBusinessDays(day('2026-09-18'), day('2026-09-18'), false)).toBe(1)
    expect(countBusinessDays(day('2026-09-19'), day('2026-09-20'), false)).toBe(0)
  })

  it('removes the public holidays falling on a weekday', () => {
    // Week of 2026-05-11 to 2026-05-15: Ascension (Thursday 14) is a holiday.
    expect(countBusinessDays(day('2026-05-11'), day('2026-05-15'), false)).toBe(5)
    expect(countBusinessDays(day('2026-05-11'), day('2026-05-15'), true)).toBe(4)
  })

  it('ignores a holiday falling on a weekend (2026-08-15 = Saturday)', () => {
    expect(countBusinessDays(day('2026-08-10'), day('2026-08-21'), true)).toBe(10)
  })

  it('returns 0 when the end precedes the start', () => {
    expect(countBusinessDays(day('2026-09-18'), day('2026-09-01'), true)).toBe(0)
  })
})

describe('businessDaysElapsed', () => {
  it('is 0 on the creation day', () => {
    expect(businessDaysElapsed('2026-09-18', '2026-09-18', true)).toBe(0)
  })

  it('spans the weekend: created on Friday, 1 day on Monday', () => {
    expect(businessDaysElapsed('2026-09-11', '2026-09-14', true)).toBe(1)
  })

  it('finds the workbook values again (reference: Friday 2026-09-18)', () => {
    expect(businessDaysElapsed('2026-07-27', '2026-09-18', true)).toBe(39)
    expect(businessDaysElapsed('2026-08-10', '2026-09-18', true)).toBe(29)
    expect(businessDaysElapsed('2026-09-17', '2026-09-18', true)).toBe(1)
  })

  it('a creation on the weekend starts counting on Monday', () => {
    expect(businessDaysElapsed('2026-09-12', '2026-09-14', true)).toBe(0)
    expect(businessDaysElapsed('2026-09-12', '2026-09-15', true)).toBe(1)
  })

  it('never returns a negative value, and null when a date is invalid', () => {
    expect(businessDaysElapsed('2026-09-20', '2026-09-18', true)).toBe(0)
    expect(businessDaysElapsed('n/a', '2026-09-18', true)).toBeNull()
  })
})
