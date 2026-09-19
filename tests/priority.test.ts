import { describe, expect, it } from 'vitest'
import { alertStatusFromDays, isInAlert, priorityFromDays } from '@/domain/priority'

describe('priorityFromDays — =SI(K>4;"Bloquante";SI(K>=3;"Majeure";SI(K>=1;"Mineure";"")))', () => {
  it.each([
    [0, null],
    [0.5, null],
    [1, 'minor'],
    [2, 'minor'],
    [2.9, 'minor'],
    [3, 'major'],
    [4, 'major'],
    [4.5, 'blocking'],
    [5, 'blocking'],
    [39, 'blocking'],
  ])('K = %s → %s', (days, expected) => {
    expect(priorityFromDays(days)).toBe(expected)
  })

  it('an empty K cell gives no priority (empty string in Excel)', () => {
    expect(priorityFromDays(null)).toBeNull()
    expect(priorityFromDays(Number.NaN)).toBeNull()
  })
})

describe('Takt alert — NB.SI(K:K;">4")', () => {
  it('triggers strictly beyond 4 business days', () => {
    expect(isInAlert(4)).toBe(false)
    expect(isInAlert(5)).toBe(true)
    expect(isInAlert(null)).toBe(false)
  })

  it('always coincides with the « blocking » priority', () => {
    for (let k = 0; k <= 12; k += 0.5) {
      expect(isInAlert(k)).toBe(priorityFromDays(k) === 'blocking')
    }
  })

  it('derives the status when the file does not provide it', () => {
    expect(alertStatusFromDays(4)).toBe('Conforme')
    expect(alertStatusFromDays(5)).toBe('>4j Jours Ouvrés')
    expect(alertStatusFromDays(null)).toBe('')
  })
})
