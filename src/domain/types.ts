/**
 * Modèle métier du suivi des anomalies.
 *
 * Le vocabulaire reprend celui du classeur Excel d'origine (feuille « Données Globales »).
 */

/** Priorité d'une anomalie, telle que calculée par la colonne M du classeur. */
export type Priorite = 'Mineure' | 'Majeure' | 'Bloquante'

/** Ordre des colonnes dans les tableaux Excel : Mineure, Majeure, Bloquante. */
export const PRIORITES: readonly Priorite[] = ['Mineure', 'Majeure', 'Bloquante']

/** Origine de la valeur « Jours Ouvrés Écoulés » retenue pour une anomalie. */
export type OrigineJours = 'fichier' | 'calcul'

/** Une ligne de la feuille « Données Globales ». */
export interface Anomalie {
  /** Numéro de ligne dans le fichier source (1 = en-tête), utile pour le diagnostic. */
  ligne: number
  numero: string
  sef: string
  libelle: string
  description: string
  /** Équipe telle qu'écrite dans le fichier (peut contenir des espaces parasites). */
  equipe: string
  /** Équipe normalisée, utilisée pour tous les regroupements. */
  equipeCle: string
  rame: string
  rameCle: string
  vehicule: string
  /** Date de création au format ISO `AAAA-MM-JJ`, ou `null` si absente/illisible. */
  dateCreation: string | null
  commentaire: string
  creeePar: string
  /** Colonne K : jours ouvrés écoulés depuis la création. */
  joursOuvres: number | null
  origineJours: OrigineJours | null
  /** Colonne L : statut d'alerte Takt. */
  statutAlerte: string
  /** Colonne M : priorité déduite des jours ouvrés (`null` = cellule vide dans Excel). */
  priorite: Priorite | null
}

/** Décompte par priorité. `total` = Mineure + Majeure + Bloquante, comme `SOMME(B:D)` dans Excel. */
export interface Repartition {
  Mineure: number
  Majeure: number
  Bloquante: number
  total: number
}

/** Une ligne d'un tableau de synthèse (une équipe ou une machine). */
export interface LigneSynthese extends Repartition {
  /** Clé normalisée de l'équipe ou de la machine. */
  cle: string
  libelle: string
}

/** Les cinq indicateurs de tête de la feuille « Tableau de Bord ». */
export interface IndicateursGlobaux {
  /** `NBVAL('Données Globales'!A:A)-1` */
  totalAnomalies: number
  /** `NB.SI('Données Globales'!M:M;"Bloquante")` */
  bloquantes: number
  /** `NB.SI('Données Globales'!M:M;"Majeure")` */
  majeures: number
  /** `NB.SI('Données Globales'!M:M;"Mineure")` */
  mineures: number
  /** `NB.SI('Données Globales'!K:K;">4")` */
  alertePlus4Jours: number
}

/** Tableau « Synthèse par Équipe » de la feuille « Tableau de Bord ». */
export interface SyntheseEquipes {
  lignes: LigneSynthese[]
  /** Ligne « Total Général » : somme des équipes listées. */
  totalGeneral: Repartition
  /**
   * Anomalies priorisées dont l'équipe n'est pas reconnue : elles comptent dans les
   * indicateurs de tête mais dans aucune ligne du tableau (même comportement qu'Excel).
   */
  horsSynthese: number
}

/** Tableau « Machine × criticité » d'une feuille équipe. */
export interface AnalyseEquipe {
  lignes: LigneSynthese[]
  /** Ligne « Total ». */
  total: Repartition
  /** Anomalies priorisées de l'équipe dont la rame n'est pas reconnue (absentes du tableau). */
  horsTableau: number
}

/** Référence à une équipe ou une machine : clé de regroupement + libellé affiché. */
export interface Reference {
  cle: string
  libelle: string
}

/** Équipe navigable : une page par équipe, comme une feuille par équipe dans Excel. */
export interface Equipe extends Reference {
  /** Segment d'URL (`/equipe/montage-1`). */
  slug: string
}
