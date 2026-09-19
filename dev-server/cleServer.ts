/**
 * Vite plugin (`dev` and `preview` servers) adding two routes:
 *
 *  GET /mock-api/anomalies-export
 *      Mock clé API: requires an `Authorization: Bearer …` header and returns the
 *      `mock/cle-export.xlsx` workbook. Lets the whole pipeline run without the real API.
 *
 *  GET /cle-proxy
 *      Relay to the real API (« api.url » of config.json, overridden by config.local.json when
 *      that file exists, exactly as in the browser), used when « api.viaProxy » is true.
 *      The call leaves from the Node server, not from the browser: it is therefore not subject
 *      to CORS. The target is read from those files on the server side, never from the request:
 *      the relay cannot be diverted to another address.
 *
 * In production (static files), these routes do not exist: either clé allows the origin of
 * the application (CORS), or the front web server reproduces the relay (see README).
 *
 * The messages of the JSON responses are in French: the application shows them to the user.
 */
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Connect, Logger, Plugin } from 'vite'

const MOCK_PATH = '/mock-api/anomalies-export'
const PROXY_PATH = '/cle-proxy'
/** Local override of config.json, in the same folder (see src/config/configuration.ts). */
const LOCAL_CONFIG_FILE = 'config.local.json'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function respondJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function pathOf(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0] ?? ''
}

function hasBearer(req: IncomingMessage): boolean {
  return /^Bearer\s+\S+/i.test(req.headers.authorization ?? '')
}

function mockApi(root: string): Connect.NextHandleFunction {
  const file = path.resolve(root, 'mock', 'cle-export.xlsx')
  return (req, res, next) => {
    if (pathOf(req) !== MOCK_PATH) return next()
    if (req.method !== 'GET') return respondJson(res, 405, { error: 'Méthode non autorisée : GET attendu.' })
    if (!hasBearer(req)) {
      return respondJson(res, 401, { error: 'Token JWT manquant (en-tête Authorization: Bearer <token>).' })
    }

    readFile(file)
      .then((content) => {
        res.statusCode = 200
        res.setHeader('Content-Type', XLSX_TYPE)
        res.setHeader('Content-Disposition', 'attachment; filename="cle-export.xlsx"')
        res.setHeader('Cache-Control', 'no-store')
        res.end(content)
      })
      .catch(() =>
        respondJson(res, 404, {
          error: 'Jeu de données simulé introuvable (mock/cle-export.xlsx).',
          hint: 'Créez-le avec : npm run mock:import -- "C:\\chemin\\vers\\Suivi_Anomalies_Industrielles.xlsx"',
        }),
      )
  }
}

/** Extracts « api.url » from a decoded JSON content; `undefined` when the key is not defined. */
function apiUrlOf(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const api = (raw as { api?: unknown }).api
  if (api === null || typeof api !== 'object' || Array.isArray(api)) return undefined
  return (api as { url?: unknown }).url
}

/**
 * Reads « api.url » from config.json, then from config.local.json (same folder) which wins when
 * it exists: the browser applies the same override, so the relay must target the same URL.
 * A missing config.local.json is the normal case; unreadable or malformed, it is ignored with a warning.
 */
async function readApiUrl(configFile: string, logger: Logger): Promise<string> {
  let url = apiUrlOf(JSON.parse(await readFile(configFile, 'utf-8')))

  const localFile = path.join(path.dirname(configFile), LOCAL_CONFIG_FILE)
  try {
    const localUrl = apiUrlOf(JSON.parse(await readFile(localFile, 'utf-8')))
    if (localUrl !== undefined) url = localUrl
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`[cle-server] ${localFile} is ignored: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return typeof url === 'string' ? url.trim() : ''
}

function proxy(configFile: string, logger: Logger): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (pathOf(req) !== PROXY_PATH) return next()
    if (req.method !== 'GET') return respondJson(res, 405, { error: 'Méthode non autorisée : GET attendu.' })

    void (async () => {
      let target: URL
      try {
        // Re-read on every call: a change of URL is taken into account without restarting the server.
        target = new URL(await readApiUrl(configFile, logger))
        if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('unsupported protocol')
      } catch {
        return respondJson(res, 500, {
          error:
            'Relais : « api.url » doit être une URL absolue (http ou https) dans config.json ou config.local.json.',
        })
      }

      try {
        const headers: Record<string, string> = {}
        if (req.headers.authorization) headers.Authorization = req.headers.authorization
        if (typeof req.headers.accept === 'string') headers.Accept = req.headers.accept

        const response = await fetch(target, { method: 'GET', headers, redirect: 'follow' })
        res.statusCode = response.status
        for (const name of ['content-type', 'content-disposition']) {
          const value = response.headers.get(name)
          if (value) res.setHeader(name, value)
        }
        res.setHeader('Cache-Control', 'no-store')
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (e) {
        const cause = e instanceof Error ? ((e.cause as Error | undefined)?.message ?? e.message) : String(e)
        respondJson(res, 502, {
          error: `Relais : impossible de joindre ${target.origin}.`,
          detail: cause,
          hint: 'Derrière un proxy d’entreprise qui déchiffre le TLS, démarrez Node avec NODE_EXTRA_CA_CERTS=<certificat racine>.',
        })
      }
    })()
  }
}

export function cleServer(): Plugin {
  return {
    name: 'cle-server',
    configureServer(server) {
      const root = server.config.root
      server.middlewares.use(mockApi(root))
      server.middlewares.use(proxy(path.resolve(root, 'public', 'config.json'), server.config.logger))
    },
    configurePreviewServer(server) {
      const root = server.config.root
      server.middlewares.use(mockApi(root))
      // In preview, the browser reads config.json (and config.local.json) from the build: the relay reads the same.
      server.middlewares.use(
        proxy(path.resolve(root, server.config.build.outDir, 'config.json'), server.config.logger),
      )
    },
  }
}
