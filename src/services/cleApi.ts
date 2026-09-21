/**
 * clé access service: a JWT-authenticated GET returning the Excel workbook that contains
 * the data set of the « Données Globales » sheet.
 *
 * The URL and the token come from `public/config.json`, overridden by `public/config.local.json`
 * (see src/config/configuration.ts).
 */
import { PROXY_PATH, resourceUrl, type ApiConfiguration } from '@/config/configuration'

export type ApiErrorCode =
  | 'CONFIGURATION'
  | 'AUTHENTICATION'
  | 'HTTP'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'FORMAT'

/** clé call error, with a message meant for the user and a resolution hint. */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly detail?: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface CleExport {
  content: ArrayBuffer
  fileName: string | null
  contentType: string | null
  receivedAt: Date
}

export interface JwtInfo {
  /** `false` when the token does not look like a JWT (three segments, JSON payload). */
  readable: boolean
  expiresAt: Date | null
  expired: boolean
}

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream;q=0.9',
  '*/*;q=0.8',
].join(', ')

/** Strips a « Bearer » prefix pasted by mistake into the configuration. */
function bareToken(token: string): string {
  return token.replace(/^bearer\s+/i, '').trim()
}

/**
 * Reads the expiry date (`exp`) of a JWT, without checking its signature — that is the
 * server's job. Only used to explain an authentication refusal.
 */
export function inspectJwt(token: string, now: Date = new Date()): JwtInfo {
  const unreadable: JwtInfo = { readable: false, expiresAt: null, expired: false }
  const segments = bareToken(token).split('.')
  if (segments.length !== 3 || !segments[1]) return unreadable

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload: unknown = JSON.parse(atob(padded))
    if (payload === null || typeof payload !== 'object') return unreadable
    const exp = (payload as Record<string, unknown>).exp
    if (typeof exp !== 'number') return { readable: true, expiresAt: null, expired: false }
    const expiresAt = new Date(exp * 1000)
    return { readable: true, expiresAt, expired: expiresAt.getTime() <= now.getTime() }
  } catch {
    return unreadable
  }
}

function fileNameFrom(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const extended = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(contentDisposition)
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* fall back to the simple form */
    }
  }
  const simple = /filename\s*=\s*("?)([^";]+)\1/i.exec(contentDisposition)
  return simple?.[2]?.trim() ?? null
}

async function bodyExcerpt(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.text()).replace(/\s+/g, ' ').trim()
    return body === '' ? undefined : body.slice(0, 300)
  } catch {
    return undefined
  }
}

/** Checks that the received content looks like a workbook, not an HTML page or JSON. */
function checkContent(content: ArrayBuffer, contentType: string | null): void {
  if (content.byteLength === 0) {
    throw new ApiError('FORMAT', 'clé a répondu avec un contenu vide.')
  }

  const bytes = new Uint8Array(content.slice(0, 512))
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b // xlsx
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 // xls
  if (isZip || isOle) return

  const start = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '').trimStart()
  // A login page returned with a 200 status. JSON, on the other hand, is the list API of clé.
  if (start.startsWith('<')) {
    throw new ApiError(
      'FORMAT',
      "clé a répondu avec une page HTML/XML au lieu des données.",
      `Content-Type : ${contentType ?? 'inconnu'}. Début de la réponse : ${start.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
  }
  // Other content (JSON, CSV, workbook): the reader decides.
}

/**
 * Downloads the clé Excel export.
 * @throws ApiError with a code usable by the interface.
 */
export async function downloadExport(
  api: ApiConfiguration,
  externalSignal?: AbortSignal,
): Promise<CleExport> {
  if (api.url === '') {
    throw new ApiError(
      'CONFIGURATION',
      "L'URL de l'API clé n'est pas renseignée.",
      'Renseignez « api.url » dans public/config.local.json (à défaut, config.json).',
    )
  }
  const token = bareToken(api.jwtToken)
  if (token === '') {
    throw new ApiError(
      'CONFIGURATION',
      "Le token JWT n'est pas renseigné.",
      'Renseignez « api.jwtToken » dans public/config.local.json (à défaut, config.json).',
    )
  }

  let target: string
  try {
    target = api.viaProxy ? resourceUrl(PROXY_PATH) : new URL(api.url, document.baseURI).toString()
  } catch {
    throw new ApiError('CONFIGURATION', `L'URL de l'API clé est invalide : « ${api.url} ».`)
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, api.timeoutMs)
  const abortFromOutside = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromOutside, { once: true })

  try {
    let response: Response
    try {
      response = await fetch(target, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: ACCEPTED_TYPES },
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (e) {
      if (timedOut) {
        throw new ApiError(
          'TIMEOUT',
          `clé n'a pas répondu dans le délai imparti (${Math.round(api.timeoutMs / 1000)} s).`,
          'Le délai se règle avec « api.timeoutMs » dans config.json.',
        )
      }
      if (externalSignal?.aborted) throw e
      throw new ApiError(
        'NETWORK',
        'Impossible de joindre clé.',
        api.viaProxy
          ? 'Vérifiez l’URL « api.url » et que le serveur Vite est démarré (le relais /cle-proxy en dépend).'
          : 'Vérifiez l’URL et le réseau. Si clé ne renvoie pas d’en-têtes CORS, passez « api.viaProxy » à true dans config.json.',
      )
    }

    if (response.status === 401 || response.status === 403) {
      const jwt = inspectJwt(token)
      let hint = 'Mettez à jour « api.jwtToken » dans public/config.local.json (à défaut, config.json).'
      if (!jwt.readable) hint = `Le token configuré n'a pas la forme d'un JWT. ${hint}`
      else if (jwt.expired && jwt.expiresAt) {
        hint = `Le token a expiré le ${jwt.expiresAt.toLocaleString('fr-FR')}. ${hint}`
      }
      throw new ApiError(
        'AUTHENTICATION',
        `clé a refusé l'authentification (HTTP ${response.status}).`,
        hint,
        response.status,
      )
    }

    if (!response.ok) {
      const excerpt = await bodyExcerpt(response)
      throw new ApiError(
        'HTTP',
        `clé a répondu avec une erreur HTTP ${response.status}${response.statusText ? ` (${response.statusText})` : ''}.`,
        excerpt,
        response.status,
      )
    }

    const contentType = response.headers.get('content-type')
    const content = await response.arrayBuffer()
    checkContent(content, contentType)

    return {
      content,
      fileName: fileNameFrom(response.headers.get('content-disposition')),
      contentType,
      receivedAt: new Date(),
    }
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromOutside)
  }
}
