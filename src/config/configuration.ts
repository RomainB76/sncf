/**
 * Configuration de l'application, lue à l'exécution dans `public/config.json`.
 *
 * Le fichier n'est PAS compilé dans le bundle : on peut changer l'URL ou le token sans
 * reconstruire l'application, y compris une fois déployée (il suffit d'actualiser les données).
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

/** URL d'une ressource servie à côté de index.html (compatible avec un déploiement en sous-dossier). */
export function urlRessource(chemin: string): string {
  return new URL(chemin, document.baseURI).toString()
}

/**
 * Charge `config.json`. Rechargé à chaque actualisation des données, pour qu'un changement
 * d'URL ou de token soit pris en compte sans redémarrer quoi que ce soit.
 */
export async function chargerConfiguration(): Promise<Configuration> {
  let reponse: Response
  try {
    reponse = await fetch(urlRessource('config.json'), { cache: 'no-store' })
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

  let brut: unknown
  try {
    brut = await reponse.json()
  } catch (e) {
    throw new ErreurConfiguration(
      'Le fichier config.json n’est pas un JSON valide.',
      e instanceof Error ? e.message : String(e),
    )
  }
  return interpreterConfiguration(brut)
}
