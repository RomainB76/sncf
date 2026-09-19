import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ErreurLecture, lireClasseur, lireDate } from '@/services/lectureExcel'

type Cellule = string | number | null

/** Construit un classeur xlsx en mémoire ; les feuilles sont créées dans l'ordre fourni. */
function classeurMulti(feuilles: [nom: string, lignes: Cellule[][]][]): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [nom, lignes] of feuilles) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lignes), nom)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

function classeur(lignes: Cellule[][], nomFeuille = 'Données Globales'): Uint8Array {
  return classeurMulti([[nomFeuille, lignes]])
}

const EN_TETES = [
  'Numéro', 'SEF', 'Libellé', 'Description', 'Équipe', 'Rame', 'Véhicule',
  'Date de création', 'Commentaire', 'Créée par', 'Jours Ouvrés Écoulés', 'Statut Alerte Takt', 'Priorité',
]

describe('lireClasseur — export identique à la feuille « Données Globales »', () => {
  it('lit les 13 colonnes et recalcule la priorité à partir de K', async () => {
    const { anomalies, feuille, origineJours } = await lireClasseur(
      classeur([
        EN_TETES,
        // Données fictives : aucun nom ni libellé réel ne doit figurer dans les tests.
        [33, 'Non', 'Absent', 'Pièce manquante', 'MONTAGE 1  ', 'X76611', 'X76611', 46230, 'En attente de pièce', 'A. EXEMPLE', 39, '🚨 >4j Jours Ouvrés', 'PRIORITÉ FAUSSE'],
        [210, 'Non', 'Pré Peinture', 'Retouche', 'Peinture', 'X76611', 'XR761611', 46280, null, 'B. EXEMPLE', 2, 'Conforme', 'Mineure'],
      ]),
    )

    expect(feuille).toBe('Données Globales')
    expect(origineJours).toEqual({ fichier: 2, calcul: 0, absent: 0 })
    expect(anomalies[0]).toMatchObject({
      ligne: 2,
      numero: '33',
      equipe: 'MONTAGE 1',
      equipeCle: 'MONTAGE 1',
      rameCle: 'X76611',
      dateCreation: '2026-07-27',
      joursOuvres: 39,
      origineJours: 'fichier',
      statutAlerte: '🚨 >4j Jours Ouvrés',
      // La colonne « Priorité » du fichier est ignorée : seule la formule fait foi.
      priorite: 'Bloquante',
    })
    expect(anomalies[1]).toMatchObject({ equipeCle: 'PEINTURE', priorite: 'Mineure', commentaire: '' })
  })

  it('repère les colonnes par leur nom, quel que soit leur ordre ou leur casse', async () => {
    const { anomalies } = await lireClasseur(
      classeur([
        ['RAME', 'equipe', 'jours ouvres ecoules', 'NUMERO'],
        ['Z27575', 'NUIT', 4, 7],
      ]),
    )
    expect(anomalies[0]).toMatchObject({ numero: '7', equipeCle: 'NUIT', rameCle: 'Z27575', priorite: 'Majeure' })
  })

  it('tolère un titre au-dessus de la ligne d’en-tête', async () => {
    const { anomalies } = await lireClasseur(
      classeur([['Export clé du 18/09/2026'], [], EN_TETES, [1, 'Non', 'Absent', 'x', 'NUIT', 'Z27575', 'Z27575', 46282, null, 'A', 1, 'Conforme', 'Mineure']]),
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.ligne).toBe(4)
  })

  it('conserve les descriptions sur plusieurs lignes dans une seule anomalie', async () => {
    const { anomalies } = await lireClasseur(
      classeur([EN_TETES, [125, 'Non', 'Branchement', 'Première ligne\nDeuxième ligne\nTroisième ligne', 'MONTAGE 1', 'Z27575', 'Z27575', 46275, null, 'C. EXEMPLE', 5, null, null]]),
    )
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]?.description).toBe('Première ligne\nDeuxième ligne\nTroisième ligne')
  })

  it('ignore les lignes entièrement vides', async () => {
    const { anomalies } = await lireClasseur(classeur([EN_TETES, [], [1, null, null, null, 'NUIT', 'Z27575', null, null, null, null, 3, null, null], []]))
    expect(anomalies).toHaveLength(1)
  })
})

describe('lireClasseur — jours ouvrés', () => {
  const SANS_K = ['Numéro', 'Équipe', 'Rame', 'Date de création']
  const options = { dateReference: '2026-09-18' }

  it('mode auto : calcule depuis la date de création quand la colonne K est absente', async () => {
    const { anomalies, origineJours } = await lireClasseur(
      classeur([SANS_K, [1, 'NUIT', 'Z27575', 46230], [2, 'NUIT', 'Z27575', '17/09/2026'], [3, 'NUIT', 'Z27575', '2026-09-18T08:30:00']]),
      options,
    )
    expect(anomalies.map((a) => [a.joursOuvres, a.origineJours, a.priorite])).toEqual([
      [39, 'calcul', 'Bloquante'],
      [1, 'calcul', 'Mineure'],
      [0, 'calcul', null],
    ])
    expect(origineJours).toEqual({ fichier: 0, calcul: 3, absent: 0 })
  })

  it('mode auto : la valeur du fichier prime, le calcul comble les cellules vides', async () => {
    const { anomalies } = await lireClasseur(
      classeur([[...SANS_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, 2], [2, 'NUIT', 'Z27575', 46230, null]]),
      options,
    )
    expect(anomalies.map((a) => [a.joursOuvres, a.origineJours])).toEqual([[2, 'fichier'], [39, 'calcul']])
  })

  it('mode calcul : ignore la colonne du fichier', async () => {
    const { anomalies } = await lireClasseur(
      classeur([[...SANS_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, 2]]),
      { ...options, joursOuvres: 'calcul' },
    )
    expect(anomalies[0]).toMatchObject({ joursOuvres: 39, origineJours: 'calcul', priorite: 'Bloquante' })
  })

  it('mode fichier : ne calcule jamais', async () => {
    const { anomalies, origineJours } = await lireClasseur(
      classeur([[...SANS_K, 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', 46230, null]]),
      { ...options, joursOuvres: 'fichier' },
    )
    expect(anomalies[0]).toMatchObject({ joursOuvres: null, priorite: null })
    expect(origineJours.absent).toBe(1)
  })

  it('accepte un nombre écrit en texte, avec une virgule décimale', async () => {
    const { anomalies } = await lireClasseur(classeur([['Numéro', 'Équipe', 'Rame', 'Jours Ouvrés Écoulés'], [1, 'NUIT', 'Z27575', ' 4,5 ']]))
    expect(anomalies[0]).toMatchObject({ joursOuvres: 4.5, priorite: 'Bloquante' })
  })
})

describe('lireClasseur — feuilles et erreurs', () => {
  const LIGNE = [1, 'Non', 'Absent', 'x', 'NUIT', 'Z27575', 'Z27575', 46282, null, 'A', 1, 'Conforme', 'Mineure']

  it('choisit la feuille configurée, sans tenir compte des accents ni de la casse', async () => {
    const { feuille, anomalies } = await lireClasseur(
      classeurMulti([['Tableau de Bord', [['sans rapport']]], ['DONNEES GLOBALES', [EN_TETES, LIGNE]]]),
      { feuille: 'Données Globales' },
    )
    expect(feuille).toBe('DONNEES GLOBALES')
    expect(anomalies).toHaveLength(1)
  })

  it('se rabat sur la première feuille, en le signalant', async () => {
    const { feuille, avertissements } = await lireClasseur(
      classeurMulti([['Export', [EN_TETES, LIGNE]], ['Notes', [['sans rapport']]]]),
      { feuille: 'Données Globales' },
    )
    expect(feuille).toBe('Export')
    expect(avertissements.some((a) => a.includes('introuvable'))).toBe(true)
  })

  it('lit un export à feuille unique dont le nom est quelconque', async () => {
    const { feuille, avertissements } = await lireClasseur(classeur([EN_TETES], 'Export'), { feuille: 'Données Globales' })
    expect(feuille).toBe('Export')
    expect(avertissements.some((a) => a.includes('introuvable'))).toBe(false)
  })

  it('nomme les colonnes obligatoires manquantes', async () => {
    await expect(lireClasseur(classeur([['Numéro', 'Libellé', 'Description', 'Rame'], [1, 'a', 'b', 'c']]))).rejects.toThrow(
      /Équipe/,
    )
    await expect(lireClasseur(classeur([['Numéro', 'Équipe', 'Rame', 'Libellé'], [1, 'a', 'b', 'c']]))).rejects.toThrow(
      /Jours Ouvrés Écoulés, Date de création/,
    )
  })

  it('refuse une feuille sans ligne d’en-tête reconnaissable', async () => {
    await expect(lireClasseur(classeur([['a', 'b'], [1, 2]]))).rejects.toBeInstanceOf(ErreurLecture)
  })
})

describe('lireDate', () => {
  it.each([
    [46230, '2026-07-27'],
    [46283.75, '2026-09-18'],
    ['18/09/2026', '2026-09-18'],
    ['18/09/2026 14:35', '2026-09-18'],
    ['1/9/26', '2026-09-01'],
    ['2026-09-18', '2026-09-18'],
    ['2026-09-18T07:12:00Z', '2026-09-18'],
    ['31/02/2026', null],
    ['demain', null],
    [null, null],
    [0, null],
  ])('%s → %s', (entree, attendu) => {
    expect(lireDate(entree)).toBe(attendu)
  })

  it('gère le calendrier 1904 des anciens classeurs Mac', () => {
    expect(lireDate(44768, true)).toBe('2026-07-27')
  })
})
