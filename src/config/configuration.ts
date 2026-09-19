/**
 * Application configuration, read at runtime from `public/config.json`.
 *
 * The file is NOT compiled into the bundle: the URL or the token can change without rebuilding
 * the application, even once deployed (refreshing the data is enough).
 *
 * A `config.local.json` file placed next to it overrides `config.json` (see `mergeConfiguration`).
 * It is excluded from the repository by .gitignore: that is where the real API URL and the real
 * JWT token go, never in `config.json`, which is versioned in a public repository.
 */
import type { BusinessDaysMode } from '@/services/excelReader'

export interface ApiConfiguration {
  /** URL of the GET returning the Excel workbook exported by clé. */
  url: string
  /** JWT token, sent in the `Authorization: Bearer <token>` header. */
  jwtToken: string
  /**
   * `true`: the call goes through the `/cle-proxy` relay of the Vite server (dev and preview),
   * which works around the missing CORS headers on the clé side. `false`: direct call from the browser.
   */
  viaProxy: boolean
  /** Maximum duration of the call, in milliseconds. */
  timeoutMs: number
}

export interface DataConfiguration {
  /** Sheet to read in the received workbook (defaults to the first one). */
  sheet: string
  businessDays: BusinessDaysMode
  excludePublicHolidays: boolean
}

export interface Configuration {
  api: ApiConfiguration
  data: DataConfiguration
  /** Teams of the original workbook, in sheet order. New teams are added automatically. */
  teams: string[]
  /** Trainsets listed in every team table. New trainsets are added automatically. */
  machines: string[]
  /** Automatic refresh, in minutes (0 = disabled). */
  autoRefreshMinutes: number
}

/** Path of the anti-CORS relay exposed by the Vite server (see dev-server/cleServer.ts). */
export const PROXY_PATH = 'cle-proxy'

/** Main configuration file, versioned: must never contain a real token. */
export const CONFIG_FILE = 'config.json'

/** Optional local override, excluded from the repository by .gitignore. */
export const LOCAL_CONFIG_FILE = 'config.local.json'

export const DEFAULT_CONFIGURATION: Configuration = {
  api: { url: '', jwtToken: '', viaProxy: false, timeoutMs: 30_000 },
  data: { sheet: 'Données Globales', businessDays: 'auto', excludePublicHolidays: true },
  teams: [
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
  autoRefreshMinutes: 0,
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function asTextList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const list = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  return list.map((v) => v.trim())
}

/** Validates a JSON content and fills in the missing values with the defaults. */
export function parseConfiguration(raw: unknown): Configuration {
  const root = asObject(raw)
  const api = asObject(root.api)
  const data = asObject(root.data)
  const defaults = DEFAULT_CONFIGURATION

  const mode = asText(data.businessDays, defaults.data.businessDays)
  if (mode !== 'auto' && mode !== 'file' && mode !== 'computed') {
    throw new ConfigurationError(
      `config.json : « data.businessDays » vaut « ${mode} ».`,
      'Valeurs acceptées : "auto", "file" ou "computed".',
    )
  }

  return {
    api: {
      url: asText(api.url, defaults.api.url),
      jwtToken: asText(api.jwtToken, defaults.api.jwtToken),
      viaProxy: asBoolean(api.viaProxy, defaults.api.viaProxy),
      timeoutMs: asNonNegativeNumber(api.timeoutMs, defaults.api.timeoutMs) || defaults.api.timeoutMs,
    },
    data: {
      sheet: asText(data.sheet, defaults.data.sheet),
      businessDays: mode,
      excludePublicHolidays: asBoolean(data.excludePublicHolidays, defaults.data.excludePublicHolidays),
    },
    teams: asTextList(root.teams, defaults.teams),
    machines: asTextList(root.machines, defaults.machines),
    autoRefreshMinutes: asNonNegativeNumber(root.autoRefreshMinutes, defaults.autoRefreshMinutes),
  }
}

/**
 * Applies an override (`config.local.json`) on top of a configuration (`config.json`):
 * the `api` and `data` objects are merged key by key; the other top-level values, including
 * the `teams` and `machines` lists, are replaced as a whole when the override defines them.
 * An override (or a section) that is not an object is ignored.
 */
export function mergeConfiguration(base: unknown, override: unknown): Record<string, unknown> {
  const origin = asObject(base)
  const local = asObject(override)
  const result: Record<string, unknown> = { ...origin, ...local }
  for (const section of ['api', 'data'] as const) {
    if (section in local) result[section] = { ...asObject(origin[section]), ...asObject(local[section]) }
  }
  return result
}

/** URL of a resource served next to index.html (works when deployed in a sub-folder). */
export function resourceUrl(path: string): string {
  return new URL(path, document.baseURI).toString()
}

/** Loads and decodes `config.json`; every failure is an explicit error, displayed to the user. */
async function loadConfigJson(): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(resourceUrl(CONFIG_FILE), { cache: 'no-store' })
  } catch (e) {
    throw new ConfigurationError(
      'Impossible de charger le fichier de configuration config.json.',
      e instanceof Error ? e.message : String(e),
    )
  }
  if (!response.ok) {
    throw new ConfigurationError(
      `Fichier de configuration introuvable (config.json : HTTP ${response.status}).`,
      'Il doit se trouver dans le dossier public/ (à côté de index.html une fois l’application construite).',
    )
  }

  try {
    return (await response.json()) as unknown
  } catch (e) {
    throw new ConfigurationError(
      'Le fichier config.json n’est pas un JSON valide.',
      e instanceof Error ? e.message : String(e),
    )
  }
}

/**
 * Loads the local override `config.local.json`, or returns `undefined` when there is none.
 *
 * Silently ignored: a missing file (404), an unreachable network and an HTML page returned
 * with a 200 status (in dev, the Vite server returns index.html for any missing file).
 * A file that exists but is not a valid JSON object is ignored too, with a console warning:
 * the application carries on with `config.json` alone.
 */
async function loadLocalOverride(): Promise<unknown> {
  let response: Response
  try {
    // Explicitly asking for JSON already avoids the index.html fallback of the Vite server (it
    // then answers 404), but the content is checked in every case: another server may do the same.
    response = await fetch(resourceUrl(LOCAL_CONFIG_FILE), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
  } catch {
    return undefined
  }
  if (!response.ok) return undefined

  let content: string
  try {
    content = await response.text()
  } catch {
    return undefined
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html') || content.trimStart().startsWith('<')) return undefined

  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.warn(`${LOCAL_CONFIG_FILE} is ignored: it is not valid JSON (${detail}).`)
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    console.warn(`${LOCAL_CONFIG_FILE} is ignored: a JSON object is expected.`)
    return undefined
  }
  return value
}

/**
 * Loads `config.json`, then `config.local.json` when it exists (its values win, see
 * `mergeConfiguration`). Reloaded on every data refresh, so that a change of URL or token
 * is taken into account without restarting anything.
 */
export async function loadConfiguration(): Promise<Configuration> {
  const raw = await loadConfigJson()
  const local = await loadLocalOverride()
  return parseConfiguration(local === undefined ? raw : mergeConfiguration(raw, local))
}
