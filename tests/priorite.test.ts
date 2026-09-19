import { describe, expect, it } from 'vitest'
import { estEnAlerte, prioriteDepuisJours, statutAlerteDepuisJours } from '@/domain/priorite'

describe('prioriteDepuisJours — =SI(K>4;"Bloquante";SI(K>=3;"Majeure";SI(K>=1;"Mineure";"")))', () => {
  it.each([
    [0, null],
    [0.5, null],
    [1, 'Mineure'],
    [2, 'Mineure'],
    [2.9, 'Mineure'],
    [3, 'Majeure'],
    [4, 'Majeure'],
    [4.5, 'Bloquante'],
    [5, 'Bloquante'],
    [39, 'Bloquante'],
  ])('K = %s → %s', (jours, attendu) => {
    expect(prioriteDepuisJours(jours)).toBe(attendu)
  })

  it('une cellule K vide ne donne aucune priorité (chaîne vide dans Excel)', () => {
    expect(prioriteDepuisJours(null)).toBeNull()
    expect(prioriteDepuisJours(Number.NaN)).toBeNull()
  })
})

describe('alerte Takt — NB.SI(K:K;">4")', () => {
  it('se déclenche strictement au-delà de 4 jours ouvrés', () => {
    expect(estEnAlerte(4)).toBe(false)
    expect(estEnAlerte(5)).toBe(true)
    expect(estEnAlerte(null)).toBe(false)
  })

  it('coïncide toujours avec la priorité « Bloquante »', () => {
    for (let k = 0; k <= 12; k += 0.5) {
      expect(estEnAlerte(k)).toBe(prioriteDepuisJours(k) === 'Bloquante')
    }
  })

  it('déduit le statut quand le fichier ne le fournit pas', () => {
    expect(statutAlerteDepuisJours(4)).toBe('Conforme')
    expect(statutAlerteDepuisJours(5)).toBe('>4j Jours Ouvrés')
    expect(statutAlerteDepuisJours(null)).toBe('')
  })
})
