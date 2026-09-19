/**
 * Configuration de l'application, lue à l'exécution dans `public/config.json`.
 *
 * Le fichier n'est PAS compilé dans le bundle : on peut changer l'URL ou le token sans
 * reconstruire l'application, y compris une fois déployée (il suffit d'actualiser les données).
 *
 * Un fichier `config.local.json` placé à côté surcharge `config.json` (voir `fusionnerConfiguration`).
 * Il est exclu du dépôt par .gitignore : c'est là que vont la vraie URL de l'API et le vrai token JWT,
 * jamais dans `config.json`, qui est versionné dans un dépôt public.
 */
import type { ModeJoursOuvres } from '@/services/lectureExcel'

export interface ConfigurationApi {
  /** URL du GET renvoyant le classeur Excel exporté par clé. */
  url: string
  /** Token JWT, envoyé dans l'en-tête `Authorization: Bearer <token>`. */
  jwtToken: string
  /**
   * `true` : l'appel passe par le relais `/proxy-cle` du serveur Vite (dev et preview),
   * ce qui contourne l'absence d'en-têtes CORS côté clé. `false` : appel direct depuis le navigateur.
   */
  viaProxy: boolean
  /** Délai maximal de l'appel, en millisecondes. */
  timeoutMs: number
}

export interface ConfigurationDonnees {
  /** Feuille à lire dans le classeur reçu (à défaut : la première). */
  feuille: string
  joursOuvres: ModeJoursOuvres
  exclureJoursFeries: boolean
}

export interface Configuration {
  api: ConfigurationApi
  donnees: ConfigurationDonnees
  /** Équipes du classeur d'origine, dans l'ordre des feuilles. Les équipes nouvelles s'ajoutent d'office. */
  equipes: string[]
  /** Rames listées dans chaque tableau d'équipe. Les rames nouvelles s'ajoutent d'office. */
  machines: string[]
  /** Actualisation automatique, en minutes (0 = désactivée). */
  rafraichissementAutoMinutes: number
}

/** Chemin du relais anti-CORS exposé par le serveur Vite (voir dev-server/serveurCle.ts). */
export const CHEMIN_PROXY = 'proxy-cle'

/** Fichier de configuration principal, versionné : ne doit jamais contenir un vrai token. */
export const FICHIER_CONFIG = 'config.json'

/** Surcharge locale facultative, exclue du dépôt par .gitignore. */
export const FICHIER_CONFIG_LOCAL = 'config.local.json'

export const CONFIGURATION_PAR_DEFAUT: Configuration = {
  api: { url: '', jwtToken: '', viaProxy: false, timeoutMs: 30_000 },
  donnees: { feuille: 'Données Globales', joursOuvres: 'auto', exclureJoursFeries: true },
  equipes: [
    'AFFAIRES',
    'CHAUDRO',
    'DEMONTAGE',
    'ESSAIS',
    'MONTAGE 1',
    'MONTAGE 2',
    'MONTAGE 3',
    'NUIT',
    'PEINTURE',
    'PIECES DEPOSEES',
  ],
  machines: ['Z27575', 'Z27665', 'X76605', 'X76611'],
  rafraichissementAutoMinutes: 0,
}

export class ErreurConfiguration extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'ErreurConfiguration'
  }
}

function objet(valeur: unknown): Record<string, unknown> {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)
    ? (valeur as Record<string, unknown>)
    : {}
}

function texte(valeur: unknown, defaut: string): string {
  return typeof valeur === 'string' ? valeur.trim() : defaut
}

function booleen(valeur: unknown, defaut: boolean): boolean {
  return typeof valeur === 'boolean' ? valeur : defaut
}

function nombrePositif(valeur: unknown, defaut: number): number {
  return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 ? valeur : defaut
}

function listeDeTextes(valeur: unknown, defaut: string[]): string[] {
  if (!Array.isArray(valeur)) return defaut
  const liste = valeur.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  return liste.map((v) => v.trim())
}

/** Valide un contenu JSON et complète les valeurs absentes par les valeurs par défaut. */
export function interpreterConfiguration(brut: unknown): Configuration {
  const racine = objet(brut)
  const api = objet(racine.api)
  const donnees = objet(racine.donnees)
  const defaut = CONFIGURATION_PAR_DEFAUT

  const mode = texte(donnees.joursOuvres, defaut.donnees.joursOuvres)
  if (mode !== 'auto' && mode !== 'fichier' && mode !== 'calcul') {
    throw new ErreurConfiguration(
      `config.json : « donnees.joursOuvres » vaut « ${mode} ».`,
      'Valeurs acceptées : "auto", "fichier" ou "calcul".',
    )
  }

  return {
    api: {
      url: texte(api.url, defaut.api.url),
      jwtToken: texte(api.jwtToken, defaut.api.jwtToken),
      viaProxy: booleen(api.viaProxy, defaut.api.viaProxy),
      timeoutMs: nombrePositif(api.timeoutMs, defaut.api.timeoutMs) || defaut.api.timeoutMs,
    },
    donnees: {
      feuille: texte(donnees.feuille, defaut.donnees.feuille),
      joursOuvres: mode,
      exclureJoursFeries: booleen(donnees.exclureJoursFeries, defaut.donnees.exclureJoursFeries),
    },
    equipes: listeDeTextes(racine.equipes, defaut.equipes),
    machines: listeDeTextes(racine.machines, defaut.machines),
    rafraichissementAutoMinutes: nombrePositif(
      racine.rafraichissementAutoMinutes,
      defaut.rafraichissementAutoMinutes,
    ),
  }
}

/**
 * Applique une surcharge (`config.local.json`) par-dessus une configuration (`config.json`) :
 * les objets `api` et `donnees` sont fusionnés clé par clé ; les autres valeurs de premier niveau,
 * dont les listes `equipes` et `machines`, sont remplacées en bloc si la surcharge les définit.
 * Une surcharge (ou une section) qui n'est pas un objet est ignorée.
 */
export function fusionnerConfiguration(base: unknown, surcharge: unknown): Record<string, unknown> {
  const origine = objet(base)
  const locale = objet(surcharge)
  const resultat: Record<string, unknown> = { ...origine, ...locale }
  for (const section of ['api', 'donnees'] as const) {
    if (section in locale) resultat[section] = { ...objet(origine[section]), ...objet(locale[section]) }
  }
  return resultat
}

/** URL d'une ressource servie à côté de index.html (compatible avec un déploiement en sous-dossier). */
export function urlRessource(chemin: string): string {
  return new URL(chemin, document.baseURI).toString()
}

/** Charge et décode `config.json` ; chaque échec est une erreur explicite, affichée à l'utilisateur. */
async function chargerConfigJson(): Promise<unknown> {
  let reponse: Response
  try {
    reponse = await fetch(urlRessource(FICHIER_CONFIG), { cache: 'no-store' })
  } catch (e) {
    throw new ErreurConfiguration(
      'Impossible de charger le fichier de configuration config.json.',
      e instanceof Error ? e.message : String(e),
    )
  }
  if (!reponse.ok) {
    throw new ErreurConfiguration(
      `Fichier de configuration introuvable (config.json : HTTP ${reponse.status}).`,
      'Il doit se trouver dans le dossier public/ (à côté de index.html une fois l’application construite).',
    )
  }

  try {
    return (await reponse.json()) as unknown
  } catch (e) {
    throw new ErreurConfiguration(
      'Le fichier config.json n’est pas un JSON valide.',
      e instanceof Error ? e.message : String(e),
    )
  }
}

/**
 * Charge la surcharge locale `config.local.json`, ou renvoie `undefined` s'il n'y en a pas.
 *
 * Sont ignorés sans bruit : le fichier absent (404), le réseau injoignable et une page HTML renvoyée
 * avec un statut 200 (en dev, le serveur Vite renvoie index.html pour tout fichier inexistant).
 * Un fichier présent mais qui n'est pas un objet JSON valide est ignoré aussi, avec un avertissement
 * en console : l'application continue avec `config.json` seul.
 */
async function chargerSurchargeLocale(): Promise<unknown> {
  let reponse: Response
  try {
    // Demander explicitement du JSON évite déjà le repli sur index.html du serveur Vite (il répond
    // alors 404), mais le contenu est vérifié dans tous les cas : un autre serveur peut faire de même.
    reponse = await fetch(urlRessource(FICHIER_CONFIG_LOCAL), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch {
    return undefined
  }
  if (!reponse.ok) return undefined

  let contenu: string
  try {
    contenu = await reponse.text()
  } catch {
    return undefined
  }
  const typeContenu = reponse.headers.get('content-type') ?? ''
  if (typeContenu.includes('text/html') || contenu.trimStart().startsWith('<')) return undefined

  let valeur: unknown
  try {
    valeur = JSON.parse(contenu)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.warn(`${FICHIER_CONFIG_LOCAL} est ignoré : ce n’est pas un JSON valide (${detail}).`)
    return undefined
  }
  if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) {
    console.warn(`${FICHIER_CONFIG_LOCAL} est ignoré : un objet JSON est attendu.`)
    return undefined
  }
  return valeur
}

/**
 * Charge `config.json`, puis `config.local.json` s'il existe (ses valeurs l'emportent, voir
 * `fusionnerConfiguration`). Rechargés à chaque actualisation des données, pour qu'un changement
 * d'URL ou de token soit pris en compte sans redémarrer quoi que ce soit.
 */
export async function chargerConfiguration(): Promise<Configuration> {
  const brut = await chargerConfigJson()
  const locale = await chargerSurchargeLocale()
  return interpreterConfiguration(locale === undefined ? brut : fusionnerConfiguration(brut, locale))
}
