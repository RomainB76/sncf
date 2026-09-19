/**
 * Conformité stricte avec le classeur Excel d'origine.
 *
 * Le classeur de référence contient, pour chaque formule, la valeur calculée par Excel.
 * Ce test lit sa feuille « Données Globales » avec la chaîne de l'application, recalcule tous
 * les indicateurs, puis compare cellule par cellule avec les valeurs d'Excel :
 *   - Tableau de Bord : A4, C4, E4, G4, I4, tableau B9:E18 et ligne « Total Général » ;
 *   - chaque feuille équipe : tableau B4:E7 et ligne « Total ».
 *
 * Le test est générique : remplacez tests/fixtures/classeur-reference.xlsx par une version plus
 * récente du classeur, il reste valable. Le fichier contient des données réelles et n'est pas
 * versionné ; s'il est absent, le test est ignoré.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { analyseEquipe, indicateursGlobaux, listerEquipes, syntheseParEquipe } from '@/domain/indicateurs'
import { cleDeRegroupement } from '@/domain/normalisation'
import { PRIORITES, type Anomalie, type Reference } from '@/domain/types'
import { lireClasseur } from '@/services/lectureExcel'

const CHEMIN = fileURLToPath(new URL('./fixtures/classeur-reference.xlsx', import.meta.url))
const disponible = existsSync(CHEMIN)

const COLONNES = { Mineure: 'B', Majeure: 'C', Bloquante: 'D', total: 'E' } as const

function nombre(feuille: XLSX.WorkSheet, adresse: string): number {
  const cellule = feuille[adresse] as XLSX.CellObject | undefined
  if (!cellule || typeof cellule.v !== 'number') throw new Error(`Valeur numérique attendue en ${adresse}`)
  return cellule.v
}

function texte(feuille: XLSX.WorkSheet, adresse: string): string {
  const cellule = feuille[adresse] as XLSX.CellObject | undefined
  return cellule ? String(cellule.v) : ''
}

function reference(libelle: string): Reference {
  return { cle: cleDeRegroupement(libelle), libelle }
}

describe.skipIf(!disponible)('Conformité avec le classeur Excel', () => {
  let classeur: XLSX.WorkBook
  let anomalies: Anomalie[]

  beforeAll(async () => {
    const contenu = readFileSync(CHEMIN)
    classeur = XLSX.read(contenu, { type: 'buffer' })
    // Mode « fichier » : on reprend la colonne K telle qu'Excel la voit, sans rien recalculer.
    const lecture = await lireClasseur(new Uint8Array(contenu), { feuille: 'Données Globales', joursOuvres: 'fichier' })
    anomalies = lecture.anomalies
  })

  it('lit la feuille « Données Globales »', () => {
    expect(anomalies.length).toBeGreaterThan(0)
  })

  it('reproduit les 5 indicateurs de tête du Tableau de Bord', () => {
    const tdb = classeur.Sheets['Tableau de Bord']!
    const calcule = indicateursGlobaux(anomalies)

    expect(calcule.totalAnomalies, 'A4 Total Anomalies').toBe(nombre(tdb, 'A4'))
    expect(calcule.bloquantes, 'C4 Bloquantes').toBe(nombre(tdb, 'C4'))
    expect(calcule.majeures, 'E4 Majeures').toBe(nombre(tdb, 'E4'))
    expect(calcule.mineures, 'G4 Mineures').toBe(nombre(tdb, 'G4'))
    expect(calcule.alertePlus4Jours, 'I4 ALERTE >4 jours').toBe(nombre(tdb, 'I4'))
  })

  it('reproduit le tableau « Synthèse par Équipe » et son « Total Général »', () => {
    const tdb = classeur.Sheets['Tableau de Bord']!
    const lignesExcel: number[] = []
    for (let l = 9; texte(tdb, `A${l}`) !== '' && cleDeRegroupement(texte(tdb, `A${l}`)) !== 'TOTAL GENERAL'; l++) {
      lignesExcel.push(l)
    }
    expect(lignesExcel.length).toBeGreaterThan(0)

    const equipes = lignesExcel.map((l) => reference(texte(tdb, `A${l}`)))
    const synthese = syntheseParEquipe(anomalies, equipes)

    lignesExcel.forEach((l, i) => {
      const ligne = synthese.lignes[i]!
      for (const [champ, colonne] of Object.entries(COLONNES) as [keyof typeof COLONNES, string][]) {
        expect(ligne[champ], `${ligne.libelle} / ${champ} (${colonne}${l})`).toBe(nombre(tdb, `${colonne}${l}`))
      }
    })

    const ligneTotal = lignesExcel[lignesExcel.length - 1]! + 1
    for (const [champ, colonne] of Object.entries(COLONNES) as [keyof typeof COLONNES, string][]) {
      expect(synthese.totalGeneral[champ], `Total Général / ${champ}`).toBe(nombre(tdb, `${colonne}${ligneTotal}`))
    }
  })

  it("explique l'écart d'Excel entre « Total Anomalies » et « Total Général »", () => {
    // Dans le classeur, A4 (toutes les lignes) dépasse le « Total Général » (lignes rattachées à une
    // équipe). L'application doit attribuer cet écart, ligne pour ligne, aux anomalies « hors synthèse ».
    const tdb = classeur.Sheets['Tableau de Bord']!
    let ligneTotal = 9
    while (cleDeRegroupement(texte(tdb, `A${ligneTotal}`)) !== 'TOTAL GENERAL') ligneTotal++
    const equipesExcel = Array.from({ length: ligneTotal - 9 }, (_, i) => reference(texte(tdb, `A${9 + i}`)))

    const synthese = syntheseParEquipe(anomalies, equipesExcel)
    const sansPriorite = anomalies.filter((a) => a.numero !== '' && a.priorite === null).length

    expect(synthese.horsSynthese + sansPriorite).toBe(nombre(tdb, 'A4') - nombre(tdb, `E${ligneTotal}`))
  })

  it('ne découvre aucune équipe parasite dans les lignes fragmentées', () => {
    // Une date tombée dans la colonne Équipe ne doit pas devenir une page « 46275 ».
    for (const equipe of listerEquipes(anomalies, [])) {
      expect(equipe.cle).toMatch(/[A-Z]/)
    }
  })

  it('reproduit le tableau « Machine × criticité » de chaque feuille équipe', () => {
    const feuillesEquipe = classeur.SheetNames.filter(
      (nom) => texte(classeur.Sheets[nom]!, 'A1').startsWith('Analyse Équipe'),
    )
    expect(feuillesEquipe.length).toBeGreaterThan(0)

    for (const nomFeuille of feuillesEquipe) {
      const feuille = classeur.Sheets[nomFeuille]!
      const lignesExcel: number[] = []
      for (let l = 4; texte(feuille, `A${l}`) !== '' && cleDeRegroupement(texte(feuille, `A${l}`)) !== 'TOTAL'; l++) {
        lignesExcel.push(l)
      }
      const machines = lignesExcel.map((l) => reference(texte(feuille, `A${l}`)))
      const analyse = analyseEquipe(anomalies, cleDeRegroupement(nomFeuille), machines)

      lignesExcel.forEach((l, i) => {
        const ligne = analyse.lignes[i]!
        for (const priorite of PRIORITES) {
          expect(ligne[priorite], `${nomFeuille} / ${ligne.libelle} / ${priorite}`).toBe(
            nombre(feuille, `${COLONNES[priorite]}${l}`),
          )
        }
        expect(ligne.total, `${nomFeuille} / ${ligne.libelle} / Total`).toBe(nombre(feuille, `E${l}`))
      })

      const ligneTotal = lignesExcel[lignesExcel.length - 1]! + 1
      for (const [champ, colonne] of Object.entries(COLONNES) as [keyof typeof COLONNES, string][]) {
        expect(analyse.total[champ], `${nomFeuille} / Total / ${champ}`).toBe(nombre(feuille, `${colonne}${ligneTotal}`))
      }
    }
  })

  it('recalcule la colonne « Priorité » à l’identique de la formule Excel', async () => {
    const donnees = classeur.Sheets['Données Globales']!
    const lignes = XLSX.utils.sheet_to_json<Record<string, unknown>>(donnees, { defval: null })
    const prioritesExcel = lignes.map((l) => (l['Priorité'] === null || l['Priorité'] === '' ? null : String(l['Priorité'])))
    expect(anomalies.map((a) => a.priorite)).toEqual(prioritesExcel)
  })
})
