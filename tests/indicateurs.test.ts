import { describe, expect, it } from 'vitest'
import {
  analyseEquipe,
  indicateursGlobaux,
  listerEquipes,
  listerMachines,
  syntheseParEquipe,
} from '@/domain/indicateurs'
import { cleDeRegroupement } from '@/domain/normalisation'
import { prioriteDepuisJours } from '@/domain/priorite'
import type { Anomalie } from '@/domain/types'

let ligne = 1
function anomalie(equipe: string, rame: string, joursOuvres: number | null, numero = String(ligne)): Anomalie {
  ligne += 1
  return {
    ligne,
    numero,
    sef: 'Non',
    libelle: 'Absent',
    description: '',
    equipe,
    equipeCle: cleDeRegroupement(equipe),
    rame,
    rameCle: cleDeRegroupement(rame),
    vehicule: rame,
    dateCreation: '2026-09-01',
    commentaire: '',
    creeePar: '',
    joursOuvres,
    origineJours: joursOuvres === null ? null : 'fichier',
    statutAlerte: '',
    priorite: prioriteDepuisJours(joursOuvres),
  }
}

const DONNEES: Anomalie[] = [
  anomalie('MONTAGE 1  ', 'Z27575', 39), // Bloquante — espaces finaux, comme dans l'export
  anomalie('MONTAGE 1  ', 'X76611', 3), // Majeure
  anomalie('montage 1', 'X76611', 1), // Mineure — casse différente
  anomalie('Peinture', 'Z27575', 5), // Bloquante
  anomalie('PEINTURE', 'z27575 ', 2), // Mineure — rame à normaliser
  anomalie('NUIT', 'X76605', 0), // pas encore de priorité
  anomalie('', '', 12, 'fragment de description'), // ligne fragmentée : ni équipe ni rame
  anomalie('46275', 'Z27575', 5, 'P17x2'), // ligne fragmentée : une date dans la colonne Équipe
]

const EQUIPES = ['MONTAGE 1', 'NUIT', 'PEINTURE']
const MACHINES = ['Z27575', 'X76605', 'X76611']

describe('indicateursGlobaux', () => {
  it('compte comme les formules de tête du classeur', () => {
    expect(indicateursGlobaux(DONNEES)).toEqual({
      totalAnomalies: 8, // NBVAL(A:A)-1 : les lignes fragmentées ont du texte en colonne A
      bloquantes: 4,
      majeures: 1,
      mineures: 2,
      alertePlus4Jours: 4,
    })
  })

  it('ne compte dans le total que les lignes dont le numéro est renseigné', () => {
    expect(indicateursGlobaux([anomalie('NUIT', 'X76605', 5, '')]).totalAnomalies).toBe(0)
  })
})

describe('syntheseParEquipe', () => {
  const equipes = listerEquipes(DONNEES, EQUIPES)
  const synthese = syntheseParEquipe(DONNEES, equipes)

  it('regroupe malgré les espaces et la casse', () => {
    expect(synthese.lignes.find((l) => l.cle === 'MONTAGE 1')).toMatchObject({
      Mineure: 1,
      Majeure: 1,
      Bloquante: 1,
      total: 3,
    })
    expect(synthese.lignes.find((l) => l.cle === 'PEINTURE')).toMatchObject({ Mineure: 1, Bloquante: 1, total: 2 })
  })

  it('le total d’une équipe est la somme des trois criticités (une anomalie sans priorité n’y figure pas)', () => {
    expect(synthese.lignes.find((l) => l.cle === 'NUIT')?.total).toBe(0)
  })

  it('calcule le « Total Général » et isole les lignes sans équipe reconnue', () => {
    expect(synthese.totalGeneral).toEqual({ Mineure: 2, Majeure: 1, Bloquante: 2, total: 5 })
    expect(synthese.horsSynthese).toBe(2)
  })
})

describe('listerEquipes / listerMachines', () => {
  it('garde l’ordre de la configuration et affiche les équipes sans anomalie', () => {
    const equipes = listerEquipes([], EQUIPES)
    expect(equipes.map((e) => e.libelle)).toEqual(EQUIPES)
    expect(equipes.map((e) => e.slug)).toEqual(['montage-1', 'nuit', 'peinture'])
  })

  it('ajoute d’office une équipe présente dans les données mais absente de la configuration', () => {
    const equipes = listerEquipes([...DONNEES, anomalie('Câblage', 'Z27575', 2)], EQUIPES)
    expect(equipes.map((e) => e.cle)).toEqual(['MONTAGE 1', 'NUIT', 'PEINTURE', 'CABLAGE'])
  })

  it('écarte les valeurs qui ne peuvent pas être un nom d’équipe', () => {
    expect(listerEquipes(DONNEES, EQUIPES).map((e) => e.cle)).not.toContain('46275')
  })

  it('ajoute d’office une rame nouvelle', () => {
    const machines = listerMachines([anomalie('NUIT', 'Z99999', 1)], MACHINES)
    expect(machines.map((m) => m.cle)).toEqual([...MACHINES, 'Z99999'])
  })
})

describe('analyseEquipe', () => {
  const machines = listerMachines(DONNEES, MACHINES)

  it('croise équipe, rame et priorité', () => {
    const analyse = analyseEquipe(DONNEES, 'MONTAGE 1', machines)
    expect(analyse.lignes.map((l) => [l.libelle, l.Mineure, l.Majeure, l.Bloquante, l.total])).toEqual([
      ['Z27575', 0, 0, 1, 1],
      ['X76605', 0, 0, 0, 0],
      ['X76611', 1, 1, 0, 2],
    ])
    expect(analyse.total).toEqual({ Mineure: 1, Majeure: 1, Bloquante: 1, total: 3 })
  })

  it('signale les anomalies de l’équipe sans rame reconnue', () => {
    const analyse = analyseEquipe([anomalie('NUIT', '', 5)], 'NUIT', machines)
    expect(analyse.total.total).toBe(0)
    expect(analyse.horsTableau).toBe(1)
  })
})
