import { describe, expect, it } from 'vitest'
import {
  isoDepuisJour,
  jourDepuisIso,
  joursFeriesFrance,
  joursOuvresEcoules,
  nbJoursOuvres,
} from '@/domain/joursOuvres'

const jour = (iso: string) => jourDepuisIso(iso)!

describe('dates', () => {
  it('convertit dans les deux sens', () => {
    expect(isoDepuisJour(jour('2026-09-18'))).toBe('2026-09-18')
    expect(jourDepuisIso('1970-01-01')).toBe(0)
  })

  it('rejette les dates impossibles ou mal formées', () => {
    expect(jourDepuisIso('2026-02-31')).toBeNull()
    expect(jourDepuisIso('18/09/2026')).toBeNull()
  })
})

describe('joursFeriesFrance', () => {
  it('calcule les fêtes mobiles de 2026 (Pâques le 5 avril)', () => {
    const feries = joursFeriesFrance(2026).map(isoDepuisJour)
    expect(feries).toContain('2026-04-06') // Lundi de Pâques
    expect(feries).toContain('2026-05-14') // Ascension
    expect(feries).toContain('2026-05-25') // Lundi de Pentecôte
    expect(feries).toHaveLength(11)
  })

  it('calcule Pâques pour d’autres années', () => {
    expect(joursFeriesFrance(2025).map(isoDepuisJour)).toContain('2025-04-21')
    expect(joursFeriesFrance(2027).map(isoDepuisJour)).toContain('2027-03-29')
  })
})

describe('nbJoursOuvres — équivalent de NB.JOURS.OUVRES', () => {
  it('compte les bornes incluses, sans les week-ends', () => {
    // Du lundi 27/07/2026 au vendredi 18/09/2026 : 8 semaines pleines.
    expect(nbJoursOuvres(jour('2026-07-27'), jour('2026-09-18'), false)).toBe(40)
    expect(nbJoursOuvres(jour('2026-09-18'), jour('2026-09-18'), false)).toBe(1)
    expect(nbJoursOuvres(jour('2026-09-19'), jour('2026-09-20'), false)).toBe(0)
  })

  it('retire les jours fériés tombant en semaine', () => {
    // Semaine du 11 au 15 mai 2026 : l'Ascension (jeudi 14) est fériée.
    expect(nbJoursOuvres(jour('2026-05-11'), jour('2026-05-15'), false)).toBe(5)
    expect(nbJoursOuvres(jour('2026-05-11'), jour('2026-05-15'), true)).toBe(4)
  })

  it('ignore un férié tombant un week-end (15 août 2026 = samedi)', () => {
    expect(nbJoursOuvres(jour('2026-08-10'), jour('2026-08-21'), true)).toBe(10)
  })

  it('renvoie 0 si la fin précède le début', () => {
    expect(nbJoursOuvres(jour('2026-09-18'), jour('2026-09-01'), true)).toBe(0)
  })
})

describe('joursOuvresEcoules', () => {
  it('vaut 0 le jour de la création', () => {
    expect(joursOuvresEcoules('2026-09-18', '2026-09-18', true)).toBe(0)
  })

  it('enjambe le week-end : créée vendredi, 1 jour le lundi', () => {
    expect(joursOuvresEcoules('2026-09-11', '2026-09-14', true)).toBe(1)
  })

  it('retrouve les valeurs du classeur (référence : vendredi 18/09/2026)', () => {
    expect(joursOuvresEcoules('2026-07-27', '2026-09-18', true)).toBe(39)
    expect(joursOuvresEcoules('2026-08-10', '2026-09-18', true)).toBe(29)
    expect(joursOuvresEcoules('2026-09-17', '2026-09-18', true)).toBe(1)
  })

  it('une création le week-end démarre le décompte au lundi', () => {
    expect(joursOuvresEcoules('2026-09-12', '2026-09-14', true)).toBe(0)
    expect(joursOuvresEcoules('2026-09-12', '2026-09-15', true)).toBe(1)
  })

  it('ne renvoie jamais de valeur négative, et null si une date est invalide', () => {
    expect(joursOuvresEcoules('2026-09-20', '2026-09-18', true)).toBe(0)
    expect(joursOuvresEcoules('n/a', '2026-09-18', true)).toBeNull()
  })
})
