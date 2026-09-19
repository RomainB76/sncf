/**
 * Lecture du classeur Excel renvoyé par clé (ou importé à la main) et transformation
 * en anomalies. C'est l'équivalent du « copier/coller dans Données Globales ».
 *
 * Les colonnes sont repérées par leur nom d'en-tête, pas par leur position : l'ordre peut
 * changer et les colonnes calculées (K, L, M) peuvent être absentes sans casser la lecture.
 */
import { isoAujourdhui, joursOuvresEcoules } from '@/domain/joursOuvres'
import { cleDeRegroupement, cleEnTete, texteNettoye } from '@/domain/normalisation'
import { prioriteDepuisJours, statutAlerteDepuisJours } from '@/domain/priorite'
import type { Anomalie, OrigineJours } from '@/domain/types'

export type ModeJoursOuvres = 'auto' | 'fichier' | 'calcul'

export interface OptionsLecture {
  /** Nom de la feuille à lire ; à défaut (ou si introuvable) la première feuille est utilisée. */
  feuille?: string
  /**
   * Origine de « Jours Ouvrés Écoulés » :
   * - `auto`    : valeur du fichier si elle existe, sinon calcul depuis la date de création ;
   * - `fichier` : valeur du fichier uniquement ;
   * - `calcul`  : toujours recalculée depuis la date de création.
   */
  joursOuvres?: ModeJoursOuvres
  exclureJoursFeries?: boolean
  /** Date de référence du calcul (ISO `AAAA-MM-JJ`) ; aujourd'hui par défaut. */
  dateReference?: string
}

export interface ResultatLecture {
  anomalies: Anomalie[]
  feuille: string
  feuillesDisponibles: string[]
  avertissements: string[]
  /** Nombre d'anomalies par origine de la valeur « Jours Ouvrés Écoulés ». */
  origineJours: { fichier: number; calcul: number; absent: number }
}

/** Erreur de lecture, avec un message destiné à l'utilisateur. */
export class ErreurLecture extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'ErreurLecture'
  }
}

type Champ =
  | 'numero'
  | 'sef'
  | 'libelle'
  | 'description'
  | 'equipe'
  | 'rame'
  | 'vehicule'
  | 'dateCreation'
  | 'commentaire'
  | 'creeePar'
  | 'joursOuvres'
  | 'statutAlerte'

/** En-têtes acceptés pour chaque champ (comparés après normalisation : minuscules, sans accents). */
const EN_TETES: Record<Champ, readonly string[]> = {
  numero: ['numero', 'n', 'no', 'num', 'numero anomalie'],
  sef: ['sef'],
  libelle: ['libelle'],
  description: ['description'],
  equipe: ['equipe'],
  rame: ['rame', 'machine'],
  vehicule: ['vehicule'],
  dateCreation: ['date de creation', 'date creation', 'creee le', 'cree le'],
  commentaire: ['commentaire', 'commentaires'],
  creeePar: ['creee par', 'cree par', 'createur'],
  joursOuvres: ['jours ouvres ecoules', 'jours ouvres', 'jours ecoules'],
  statutAlerte: ['statut alerte takt', 'statut alerte', 'statut takt'],
}

const CHAMPS_OBLIGATOIRES: readonly Champ[] = ['numero', 'equipe', 'rame']
const LIBELLES_CHAMPS: Record<Champ, string> = {
  numero: 'Numéro',
  sef: 'SEF',
  libelle: 'Libellé',
  description: 'Description',
  equipe: 'Équipe',
  rame: 'Rame',
  vehicule: 'Véhicule',
  dateCreation: 'Date de création',
  commentaire: 'Commentaire',
  creeePar: 'Créée par',
  joursOuvres: 'Jours Ouvrés Écoulés',
  statutAlerte: 'Statut Alerte Takt',
}

const MS_PAR_JOUR = 86_400_000
/** Le jour 0 du calendrier Excel (système 1900) est le 30/12/1899. */
const EPOQUE_EXCEL = Date.UTC(1899, 11, 30)
const DECALAGE_1904 = 1462

type Cellule = string | number | boolean | Date | null | undefined
type Colonnes = Partial<Record<Champ, number>>

function reconnaitreEnTetes(ligne: readonly Cellule[]): Colonnes {
  const colonnes: Colonnes = {}
  ligne.forEach((cellule, index) => {
    const cle = cleEnTete(cellule)
    if (cle === '') return
    for (const champ of Object.keys(EN_TETES) as Champ[]) {
      if (colonnes[champ] === undefined && EN_TETES[champ].includes(cle)) {
        colonnes[champ] = index
        return
      }
    }
  })
  return colonnes
}

/** Cherche la ligne d'en-tête dans les premières lignes (tolère un titre au-dessus du tableau). */
function trouverEnTetes(lignes: readonly Cellule[][]): { index: number; colonnes: Colonnes } | null {
  let meilleur: { index: number; colonnes: Colonnes; score: number } | null = null
  const limite = Math.min(lignes.length, 20)
  for (let i = 0; i < limite; i++) {
    const colonnes = reconnaitreEnTetes(lignes[i] ?? [])
    const score = Object.keys(colonnes).length
    if (score >= 3 && (meilleur === null || score > meilleur.score)) {
      meilleur = { index: i, colonnes, score }
    }
  }
  return meilleur
}

function estVide(cellule: Cellule): boolean {
  return cellule === null || cellule === undefined || (typeof cellule === 'string' && cellule.trim() === '')
}

function lireTexte(cellule: Cellule): string {
  if (estVide(cellule)) return ''
  if (cellule instanceof Date) return cellule.toISOString().slice(0, 10)
  return texteNettoye(cellule)
}

/** Texte multi-ligne (description, commentaire) : les retours à la ligne sont conservés. */
function lireTexteLong(cellule: Cellule): string {
  if (estVide(cellule)) return ''
  return String(cellule)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim()
}

function lireNumero(cellule: Cellule): string {
  if (estVide(cellule)) return ''
  if (typeof cellule === 'number' && Number.isFinite(cellule)) return String(cellule)
  return texteNettoye(cellule)
}

function lireNombre(cellule: Cellule): number | null {
  if (typeof cellule === 'number') return Number.isFinite(cellule) ? cellule : null
  if (typeof cellule === 'string') {
    const texte = cellule.trim().replace(/\s/g, '').replace(',', '.')
    if (/^-?\d+(\.\d+)?$/.test(texte)) return Number(texte)
  }
  return null
}

function isoDepuisUtc(t: number): string | null {
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function isoDepuisParties(annee: number, mois: number, jour: number): string | null {
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null
  const t = Date.UTC(annee, mois - 1, jour)
  const d = new Date(t)
  if (d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null
  return isoDepuisUtc(t)
}

/** Date de création : numéro de série Excel, objet Date ou texte (`JJ/MM/AAAA`, `AAAA-MM-JJ`…). */
export function lireDate(cellule: Cellule, date1904 = false): string | null {
  if (estVide(cellule)) return null

  if (cellule instanceof Date) return isoDepuisUtc(cellule.getTime())

  if (typeof cellule === 'number') {
    if (!Number.isFinite(cellule) || cellule < 1 || cellule > 2_958_465) return null
    const jours = Math.floor(cellule) + (date1904 ? DECALAGE_1904 : 0)
    return isoDepuisUtc(EPOQUE_EXCEL + jours * MS_PAR_JOUR)
  }

  if (typeof cellule === 'string') {
    const texte = cellule.trim()
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(texte)
    if (iso) return isoDepuisParties(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(texte)
    if (fr) {
      const annee = Number(fr[3]) < 100 ? 2000 + Number(fr[3]) : Number(fr[3])
      return isoDepuisParties(annee, Number(fr[2]), Number(fr[1]))
    }
  }

  return null
}

/**
 * Lit un classeur (xlsx, xls ou csv) et renvoie les anomalies qu'il contient.
 * @throws ErreurLecture si le fichier est illisible ou si les colonnes attendues sont absentes.
 */
export async function lireClasseur(
  contenu: ArrayBuffer | Uint8Array,
  options: OptionsLecture = {},
): Promise<ResultatLecture> {
  // SheetJS est volumineux : chargé à la demande, hors du bundle principal.
  const XLSX = await import('xlsx')

  let classeur
  try {
    classeur = XLSX.read(contenu, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false })
  } catch (e) {
    throw new ErreurLecture(
      "Le fichier reçu n'est pas un classeur Excel lisible.",
      e instanceof Error ? e.message : String(e),
    )
  }

  const feuillesDisponibles = classeur.SheetNames
  if (feuillesDisponibles.length === 0) {
    throw new ErreurLecture('Le classeur ne contient aucune feuille.')
  }

  const avertissements: string[] = []
  const premiereFeuille = feuillesDisponibles[0] as string
  let nomFeuille = premiereFeuille
  if (options.feuille) {
    const voulue = cleDeRegroupement(options.feuille)
    const trouvee = feuillesDisponibles.find((n) => cleDeRegroupement(n) === voulue)
    if (trouvee) nomFeuille = trouvee
    else if (feuillesDisponibles.length > 1) {
      avertissements.push(
        `Feuille « ${options.feuille} » introuvable : lecture de la première feuille (« ${premiereFeuille} »).`,
      )
    }
  }

  const feuille = classeur.Sheets[nomFeuille]
  if (!feuille || !feuille['!ref']) {
    throw new ErreurLecture(`La feuille « ${nomFeuille} » est vide.`)
  }

  const premiereLigne = XLSX.utils.decode_range(feuille['!ref']).s.r
  const lignes = XLSX.utils.sheet_to_json<Cellule[]>(feuille, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  })

  const enTetes = trouverEnTetes(lignes)
  if (!enTetes) {
    const apercu = (lignes[0] ?? []).filter((c) => !estVide(c)).slice(0, 8).join(' | ')
    throw new ErreurLecture(
      `Aucune ligne d'en-tête reconnue dans la feuille « ${nomFeuille} ».`,
      `Colonnes attendues : ${Object.values(LIBELLES_CHAMPS).join(', ')}. Première ligne lue : ${apercu || '(vide)'}`,
    )
  }

  const { colonnes } = enTetes
  const manquantes = CHAMPS_OBLIGATOIRES.filter((c) => colonnes[c] === undefined)
  if (colonnes.joursOuvres === undefined && colonnes.dateCreation === undefined) {
    manquantes.push('joursOuvres', 'dateCreation')
  }
  if (manquantes.length > 0) {
    throw new ErreurLecture(
      `Colonne(s) introuvable(s) dans la feuille « ${nomFeuille} » : ${manquantes.map((c) => LIBELLES_CHAMPS[c]).join(', ')}.`,
      'Les colonnes sont repérées par leur nom d’en-tête (accents et majuscules indifférents).',
    )
  }

  const mode: ModeJoursOuvres = options.joursOuvres ?? 'auto'
  const exclureFeries = options.exclureJoursFeries ?? true
  const dateReference = options.dateReference ?? isoAujourdhui()
  const date1904 = classeur.Workbook?.WBProps?.date1904 === true

  if (mode === 'fichier' && colonnes.joursOuvres === undefined) {
    avertissements.push(
      'La colonne « Jours Ouvrés Écoulés » est absente du fichier alors que la configuration impose de l’utiliser : aucune priorité ne peut être calculée.',
    )
  }
  if (mode === 'calcul' && colonnes.dateCreation === undefined) {
    avertissements.push(
      'La colonne « Date de création » est absente du fichier alors que la configuration impose de recalculer les jours ouvrés : aucune priorité ne peut être calculée.',
    )
  }

  const cellule = (ligne: readonly Cellule[], champ: Champ): Cellule => {
    const index = colonnes[champ]
    return index === undefined ? null : ligne[index]
  }

  const anomalies: Anomalie[] = []
  const origineJours = { fichier: 0, calcul: 0, absent: 0 }

  for (let i = enTetes.index + 1; i < lignes.length; i++) {
    const ligne = lignes[i]
    if (!ligne || ligne.every(estVide)) continue

    const equipe = lireTexte(cellule(ligne, 'equipe'))
    const rame = lireTexte(cellule(ligne, 'rame'))
    const dateCreation = lireDate(cellule(ligne, 'dateCreation'), date1904)

    let joursOuvres: number | null = null
    let origine: OrigineJours | null = null
    if (mode !== 'calcul') {
      joursOuvres = lireNombre(cellule(ligne, 'joursOuvres'))
      if (joursOuvres !== null) origine = 'fichier'
    }
    if (joursOuvres === null && mode !== 'fichier' && dateCreation !== null) {
      joursOuvres = joursOuvresEcoules(dateCreation, dateReference, exclureFeries)
      if (joursOuvres !== null) origine = 'calcul'
    }
    origineJours[origine ?? 'absent'] += 1

    const statutFichier = lireTexte(cellule(ligne, 'statutAlerte'))

    anomalies.push({
      ligne: premiereLigne + i + 1,
      numero: lireNumero(cellule(ligne, 'numero')),
      sef: lireTexte(cellule(ligne, 'sef')),
      libelle: lireTexte(cellule(ligne, 'libelle')),
      description: lireTexteLong(cellule(ligne, 'description')),
      equipe,
      equipeCle: cleDeRegroupement(equipe),
      rame,
      rameCle: cleDeRegroupement(rame),
      vehicule: lireTexte(cellule(ligne, 'vehicule')),
      dateCreation,
      commentaire: lireTexteLong(cellule(ligne, 'commentaire')),
      creeePar: lireTexte(cellule(ligne, 'creeePar')),
      joursOuvres,
      origineJours: origine,
      statutAlerte: origine === 'fichier' && statutFichier !== '' ? statutFichier : statutAlerteDepuisJours(joursOuvres),
      // Colonne M du classeur : toujours recalculée, exactement comme la formule Excel.
      priorite: prioriteDepuisJours(joursOuvres),
    })
  }

  if (anomalies.length === 0) {
    avertissements.push(`La feuille « ${nomFeuille} » ne contient aucune ligne de données.`)
  }

  return { anomalies, feuille: nomFeuille, feuillesDisponibles, avertissements, origineJours }
}
