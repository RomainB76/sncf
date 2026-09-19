/**
 * Plugin Vite (serveurs `dev` et `preview`) qui ajoute deux routes :
 *
 *  GET /mock-api/export-anomalies
 *      API clé simulée : exige un en-tête `Authorization: Bearer …` et renvoie le classeur
 *      `mock/export-cle.xlsx`. Permet de faire tourner toute la chaîne sans la vraie API.
 *
 *  GET /proxy-cle
 *      Relais vers la vraie API (« api.url » de config.json, surchargée par config.local.json si ce
 *      fichier existe, exactement comme dans le navigateur), utilisé quand « api.viaProxy » vaut
 *      true. L'appel part du serveur Node et non du navigateur : il n'est donc pas soumis au CORS.
 *      La cible est lue dans ces fichiers côté serveur, jamais dans la requête : le relais ne peut
 *      pas être détourné vers une autre adresse.
 *
 * En production (fichiers statiques), ces routes n'existent pas : soit clé autorise l'origine de
 * l'application (CORS), soit le serveur web frontal reproduit le relais (voir README).
 */
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Connect, Logger, Plugin } from 'vite'

const CHEMIN_MOCK = '/mock-api/export-anomalies'
const CHEMIN_PROXY = '/proxy-cle'
/** Surcharge locale de config.json, dans le même dossier (voir src/config/configuration.ts). */
const FICHIER_CONFIG_LOCAL = 'config.local.json'
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function repondreJson(res: ServerResponse, statut: number, corps: Record<string, unknown>): void {
  res.statusCode = statut
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(corps))
}

function cheminDe(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0] ?? ''
}

function porteUnBearer(req: IncomingMessage): boolean {
  return /^Bearer\s+\S+/i.test(req.headers.authorization ?? '')
}

function apiSimulee(racine: string): Connect.NextHandleFunction {
  const fichier = path.resolve(racine, 'mock', 'export-cle.xlsx')
  return (req, res, next) => {
    if (cheminDe(req) !== CHEMIN_MOCK) return next()
    if (req.method !== 'GET') return repondreJson(res, 405, { erreur: 'Méthode non autorisée : GET attendu.' })
    if (!porteUnBearer(req)) {
      return repondreJson(res, 401, { erreur: 'Token JWT manquant (en-tête Authorization: Bearer <token>).' })
    }

    readFile(fichier)
      .then((contenu) => {
        res.statusCode = 200
        res.setHeader('Content-Type', TYPE_XLSX)
        res.setHeader('Content-Disposition', 'attachment; filename="export-cle.xlsx"')
        res.setHeader('Cache-Control', 'no-store')
        res.end(contenu)
      })
      .catch(() =>
        repondreJson(res, 404, {
          erreur: 'Jeu de données simulé introuvable (mock/export-cle.xlsx).',
          aide: 'Créez-le avec : npm run mock:import -- "C:\\chemin\\vers\\Suivi_Anomalies_Industrielles.xlsx"',
        }),
      )
  }
}

/** Extrait « api.url » d'un contenu JSON décodé ; `undefined` si la clé n'y est pas définie. */
function urlApiDe(brut: unknown): unknown {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) return undefined
  const api = (brut as { api?: unknown }).api
  if (api === null || typeof api !== 'object' || Array.isArray(api)) return undefined
  return (api as { url?: unknown }).url
}

/**
 * Lit « api.url » dans config.json, puis dans config.local.json (même dossier) qui l'emporte s'il
 * existe : le navigateur applique la même surcharge, le relais doit donc viser la même URL.
 * Un config.local.json absent est le cas normal ; illisible ou mal formé, il est ignoré avec un avertissement.
 */
async function lireUrlApi(fichierConfig: string, journal: Logger): Promise<string> {
  let url = urlApiDe(JSON.parse(await readFile(fichierConfig, 'utf-8')))

  const fichierLocal = path.join(path.dirname(fichierConfig), FICHIER_CONFIG_LOCAL)
  try {
    const urlLocale = urlApiDe(JSON.parse(await readFile(fichierLocal, 'utf-8')))
    if (urlLocale !== undefined) url = urlLocale
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      journal.warn(`[serveur-cle] ${fichierLocal} est ignoré : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return typeof url === 'string' ? url.trim() : ''
}

function relais(fichierConfig: string, journal: Logger): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (cheminDe(req) !== CHEMIN_PROXY) return next()
    if (req.method !== 'GET') return repondreJson(res, 405, { erreur: 'Méthode non autorisée : GET attendu.' })

    void (async () => {
      let cible: URL
      try {
        // Relu à chaque appel : un changement d'URL est pris en compte sans redémarrer le serveur.
        cible = new URL(await lireUrlApi(fichierConfig, journal))
        if (cible.protocol !== 'http:' && cible.protocol !== 'https:') throw new Error('protocole non pris en charge')
      } catch {
        return repondreJson(res, 500, {
          erreur:
            'Relais : « api.url » doit être une URL absolue (http ou https) dans config.json ou config.local.json.',
        })
      }

      try {
        const enTetes: Record<string, string> = {}
        if (req.headers.authorization) enTetes.Authorization = req.headers.authorization
        if (typeof req.headers.accept === 'string') enTetes.Accept = req.headers.accept

        const reponse = await fetch(cible, { method: 'GET', headers: enTetes, redirect: 'follow' })
        res.statusCode = reponse.status
        for (const nom of ['content-type', 'content-disposition']) {
          const valeur = reponse.headers.get(nom)
          if (valeur) res.setHeader(nom, valeur)
        }
        res.setHeader('Cache-Control', 'no-store')
        res.end(Buffer.from(await reponse.arrayBuffer()))
      } catch (e) {
        const cause = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e)
        repondreJson(res, 502, {
          erreur: `Relais : impossible de joindre ${cible.origin}.`,
          detail: cause,
          aide: 'Derrière un proxy d’entreprise qui déchiffre le TLS, démarrez Node avec NODE_EXTRA_CA_CERTS=<certificat racine>.',
        })
      }
    })()
  }
}

export function serveurCle(): Plugin {
  return {
    name: 'serveur-cle',
    configureServer(serveur) {
      const racine = serveur.config.root
      serveur.middlewares.use(apiSimulee(racine))
      serveur.middlewares.use(relais(path.resolve(racine, 'public', 'config.json'), serveur.config.logger))
    },
    configurePreviewServer(serveur) {
      const racine = serveur.config.root
      serveur.middlewares.use(apiSimulee(racine))
      // En preview, le navigateur lit config.json (et config.local.json) dans le build : le relais lit les mêmes.
      serveur.middlewares.use(
        relais(path.resolve(racine, serveur.config.build.outDir, 'config.json'), serveur.config.logger),
      )
    },
  }
}
