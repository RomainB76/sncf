/**
 * Calcul des indicateurs — transcription des formules du classeur Excel.
 *
 * Chaque fonction cite la formule d'origine. Ce sont des fonctions pures : mêmes données
 * en entrée, mêmes chiffres qu'Excel en sortie (voir tests/conformite-excel.test.ts).
 */
import { cleDeRegroupement, estLibellePlausible, slug, texteNettoye } from './normalisation'
import { estEnAlerte } from './priorite'
import type {
  AnalyseEquipe,
  Anomalie,
  Equipe,
  IndicateursGlobaux,
  LigneSynthese,
  Priorite,
  Reference,
  Repartition,
  SyntheseEquipes,
} from './types'

export function repartitionVide(): Repartition {
  return { Mineure: 0, Majeure: 0, Bloquante: 0, total: 0 }
}

function compter(repartition: Repartition, priorite: Priorite): void {
  repartition[priorite] += 1
  repartition.total += 1
}

function additionner(cible: Repartition, source: Repartition): void {
  cible.Mineure += source.Mineure
  cible.Majeure += source.Majeure
  cible.Bloquante += source.Bloquante
  cible.total += source.total
}

/**
 * Indicateurs de tête de la feuille « Tableau de Bord » (cellules A4, C4, E4, G4 et I4).
 */
export function indicateursGlobaux(anomalies: readonly Anomalie[]): IndicateursGlobaux {
  const resultat: IndicateursGlobaux = {
    totalAnomalies: 0,
    bloquantes: 0,
    majeures: 0,
    mineures: 0,
    alertePlus4Jours: 0,
  }

  for (const a of anomalies) {
    // =NBVAL('Données Globales'!A:A)-1 : toute ligne dont la colonne « Numéro » est renseignée.
    if (a.numero !== '') resultat.totalAnomalies += 1
    // =NB.SI('Données Globales'!M:M; "Bloquante" | "Majeure" | "Mineure")
    if (a.priorite === 'Bloquante') resultat.bloquantes += 1
    else if (a.priorite === 'Majeure') resultat.majeures += 1
    else if (a.priorite === 'Mineure') resultat.mineures += 1
    // =NB.SI('Données Globales'!K:K; ">4")
    if (estEnAlerte(a.joursOuvres)) resultat.alertePlus4Jours += 1
  }

  return resultat
}

/**
 * Tableau « Synthèse par Équipe » (Tableau de Bord, A8:E19).
 *
 *   =NB.SI.ENS('Données Globales'!$E:$E; <équipe>; 'Données Globales'!$M:$M; <priorité>)
 *   Total = SOMME(B:D) ; Total Général = somme des lignes.
 */
export function syntheseParEquipe(
  anomalies: readonly Anomalie[],
  equipes: readonly Reference[],
): SyntheseEquipes {
  const lignes = new Map<string, LigneSynthese>()
  for (const equipe of equipes) {
    lignes.set(equipe.cle, { cle: equipe.cle, libelle: equipe.libelle, ...repartitionVide() })
  }

  let horsSynthese = 0
  for (const a of anomalies) {
    if (a.priorite === null) continue
    const ligne = lignes.get(a.equipeCle)
    if (ligne) compter(ligne, a.priorite)
    else horsSynthese += 1
  }

  const totalGeneral = repartitionVide()
  for (const ligne of lignes.values()) additionner(totalGeneral, ligne)

  return { lignes: [...lignes.values()], totalGeneral, horsSynthese }
}

/**
 * Tableau « Machine × criticité » d'une feuille équipe (A3:E8).
 *
 *   =NB.SI.ENS('Données Globales'!E:E; <équipe>; 'Données Globales'!F:F; <rame>; 'Données Globales'!M:M; <priorité>)
 */
export function analyseEquipe(
  anomalies: readonly Anomalie[],
  equipeCle: string,
  machines: readonly Reference[],
): AnalyseEquipe {
  const lignes = new Map<string, LigneSynthese>()
  for (const machine of machines) {
    lignes.set(machine.cle, { cle: machine.cle, libelle: machine.libelle, ...repartitionVide() })
  }

  let horsTableau = 0
  for (const a of anomalies) {
    if (a.equipeCle !== equipeCle || a.priorite === null) continue
    const ligne = lignes.get(a.rameCle)
    if (ligne) compter(ligne, a.priorite)
    else horsTableau += 1
  }

  const total = repartitionVide()
  for (const ligne of lignes.values()) additionner(total, ligne)

  return { lignes: [...lignes.values()], total, horsTableau }
}

/**
 * Liste de références : d'abord celles de la configuration (ordre du classeur, affichées même
 * à zéro), puis celles découvertes dans les données. Excel ignorait silencieusement une équipe
 * ou une rame nouvelle tant que sa ligne n'était pas ajoutée à la main ; ici elle apparaît d'office.
 */
function fusionnerReferences(
  configurees: readonly string[],
  valeursDesDonnees: Iterable<string>,
): Reference[] {
  const resultat = new Map<string, Reference>()

  for (const libelle of configurees) {
    const cle = cleDeRegroupement(libelle)
    if (cle !== '' && !resultat.has(cle)) resultat.set(cle, { cle, libelle: texteNettoye(libelle) })
  }

  const decouvertes = new Set<string>()
  for (const cle of valeursDesDonnees) {
    if (cle !== '' && !resultat.has(cle) && estLibellePlausible(cle)) decouvertes.add(cle)
  }
  for (const cle of [...decouvertes].sort((a, b) => a.localeCompare(b, 'fr'))) {
    resultat.set(cle, { cle, libelle: cle })
  }

  return [...resultat.values()]
}

/** Équipes = une page par équipe (l'équivalent des feuilles AFFAIRES … PIECES DEPOSEES). */
export function listerEquipes(
  anomalies: readonly Anomalie[],
  equipesConfigurees: readonly string[],
): Equipe[] {
  const references = fusionnerReferences(
    equipesConfigurees,
    anomalies.map((a) => a.equipeCle),
  )

  const slugsPris = new Set<string>()
  return references.map((ref) => {
    const base = slug(ref.libelle) || 'equipe'
    let candidat = base
    for (let i = 2; slugsPris.has(candidat); i++) candidat = `${base}-${i}`
    slugsPris.add(candidat)
    return { ...ref, slug: candidat }
  })
}

/** Machines (rames) listées dans chaque tableau d'équipe. */
export function listerMachines(
  anomalies: readonly Anomalie[],
  machinesConfigurees: readonly string[],
): Reference[] {
  return fusionnerReferences(
    machinesConfigurees,
    anomalies.map((a) => a.rameCle),
  )
}
