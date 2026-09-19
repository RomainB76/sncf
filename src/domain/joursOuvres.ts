/**
 * Calcul des jours ouvrés.
 *
 * Sert de repli quand le fichier reçu ne fournit pas la colonne « Jours Ouvrés Écoulés » :
 * l'application la recalcule alors à partir de la « Date de création ».
 *
 * Toutes les dates sont manipulées comme des numéros de jour (jours depuis le 01/01/1970, UTC),
 * ce qui évite tout décalage lié aux fuseaux horaires ou aux changements d'heure.
 */

const MS_PAR_JOUR = 86_400_000

/** Numéro de jour d'une date ISO `AAAA-MM-JJ`, ou `null` si le format est invalide. */
export function jourDepuisIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const annee = Number(m[1])
  const mois = Number(m[2])
  const jour = Number(m[3])
  const t = Date.UTC(annee, mois - 1, jour)
  const d = new Date(t)
  // Rejette les dates impossibles (31/02…) que Date.UTC reporterait silencieusement.
  if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) {
    return null
  }
  return Math.round(t / MS_PAR_JOUR)
}

/** Date ISO `AAAA-MM-JJ` d'un numéro de jour. */
export function isoDepuisJour(jour: number): string {
  return new Date(jour * MS_PAR_JOUR).toISOString().slice(0, 10)
}

/** Date ISO du jour courant, dans le fuseau de l'utilisateur. */
export function isoAujourdhui(maintenant: Date = new Date()): string {
  const a = maintenant.getFullYear()
  const m = String(maintenant.getMonth() + 1).padStart(2, '0')
  const j = String(maintenant.getDate()).padStart(2, '0')
  return `${a}-${m}-${j}`
}

/** 0 = dimanche … 6 = samedi (le 01/01/1970 était un jeudi). */
function jourDeSemaine(jour: number): number {
  return (((jour + 4) % 7) + 7) % 7
}

function estWeekEnd(jour: number): boolean {
  const js = jourDeSemaine(jour)
  return js === 0 || js === 6
}

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien). */
function jourDePaques(annee: number): number {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return Math.round(Date.UTC(annee, mois - 1, jour) / MS_PAR_JOUR)
}

const cacheFeries = new Map<number, number[]>()

/** Jours fériés légaux en France métropolitaine pour une année (numéros de jour). */
export function joursFeriesFrance(annee: number): number[] {
  const connu = cacheFeries.get(annee)
  if (connu) return connu

  const fixe = (mois: number, jour: number) => Math.round(Date.UTC(annee, mois - 1, jour) / MS_PAR_JOUR)
  const paques = jourDePaques(annee)
  const feries = [
    fixe(1, 1), // Jour de l'an
    paques + 1, // Lundi de Pâques
    fixe(5, 1), // Fête du Travail
    fixe(5, 8), // Victoire 1945
    paques + 39, // Ascension
    paques + 50, // Lundi de Pentecôte
    fixe(7, 14), // Fête nationale
    fixe(8, 15), // Assomption
    fixe(11, 1), // Toussaint
    fixe(11, 11), // Armistice 1918
    fixe(12, 25), // Noël
  ].sort((x, y) => x - y)

  cacheFeries.set(annee, feries)
  return feries
}

/**
 * Nombre de jours ouvrés entre deux jours, bornes incluses.
 * Équivalent de `NB.JOURS.OUVRES(debut; fin; feries)` dans Excel.
 */
export function nbJoursOuvres(debut: number, fin: number, exclureFeries: boolean): number {
  if (fin < debut) return 0

  const nbJours = fin - debut + 1
  const semainesCompletes = Math.floor(nbJours / 7)
  let total = semainesCompletes * 5
  for (let j = debut + semainesCompletes * 7; j <= fin; j++) {
    if (!estWeekEnd(j)) total++
  }

  if (exclureFeries) {
    const anneeDebut = new Date(debut * MS_PAR_JOUR).getUTCFullYear()
    const anneeFin = new Date(fin * MS_PAR_JOUR).getUTCFullYear()
    for (let annee = anneeDebut; annee <= anneeFin; annee++) {
      for (const ferie of joursFeriesFrance(annee)) {
        if (ferie >= debut && ferie <= fin && !estWeekEnd(ferie)) total--
      }
    }
  }

  return total
}

/**
 * Jours ouvrés écoulés depuis la création d'une anomalie.
 *
 * Le jour de création compte pour 0 : une anomalie créée vendredi vaut 1 le lundi suivant.
 * C'est `NB.JOURS.OUVRES(création; aujourd'hui) - 1`, borné à 0.
 */
export function joursOuvresEcoules(
  dateCreationIso: string,
  dateReferenceIso: string,
  exclureFeries: boolean,
): number | null {
  const debut = jourDepuisIso(dateCreationIso)
  const fin = jourDepuisIso(dateReferenceIso)
  if (debut === null || fin === null) return null
  if (fin < debut) return 0
  return Math.max(0, nbJoursOuvres(debut, fin, exclureFeries) - 1)
}
