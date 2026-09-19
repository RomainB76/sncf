import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiConfiguration } from '@/config/configuration'
import { ApiError, downloadExport, inspectJwt } from '@/services/cleApi'

const jwt = (payload: object) =>
  `${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.signature`

const API: ApiConfiguration = {
  url: 'https://cle.exemple.test/api/anomalies/export',
  jwtToken: jwt({ sub: 'test' }),
  viaProxy: false,
  timeoutMs: 5_000,
}

/** Start of a zip file (« PK »): every .xlsx begins this way. */
const MINIMAL_XLSX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, init)
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  const e = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(e).toBeInstanceOf(ApiError)
  return e as ApiError
}

beforeEach(() => {
  // The service resolves URLs against the page: the browser is simulated.
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('inspectJwt', () => {
  const now = new Date('2026-09-18T10:00:00Z')

  it('reads the expiry date', () => {
    const exp = Date.parse('2026-09-18T09:00:00Z') / 1000
    expect(inspectJwt(jwt({ exp }), now)).toEqual({
      readable: true,
      expired: true,
      expiresAt: new Date('2026-09-18T09:00:00Z'),
    })
    expect(inspectJwt(jwt({ exp: exp + 7200 }), now).expired).toBe(false)
  })

  it('accepts a token without expiry and a « Bearer » prefix pasted by mistake', () => {
    expect(inspectJwt(`Bearer ${jwt({ sub: 'x' })}`)).toEqual({ readable: true, expired: false, expiresAt: null })
  })

  it('reports a token that does not look like a JWT', () => {
    expect(inspectJwt('not-a-jwt').readable).toBe(false)
    expect(inspectJwt('a.b.c').readable).toBe(false)
  })
})

describe('downloadExport', () => {
  it('sends a GET with the token as Bearer and returns the workbook', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(MINIMAL_XLSX, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="cle-export.xlsx"',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await downloadExport(API)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(API.url)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API.jwtToken}`)
    expect(result.fileName).toBe('cle-export.xlsx')
    expect(result.content.byteLength).toBe(8)
  })

  it('does not double the « Bearer » prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(MINIMAL_XLSX))
    vi.stubGlobal('fetch', fetchMock)
    await downloadExport({ ...API, jwtToken: `Bearer ${API.jwtToken}` })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API.jwtToken}`)
  })

  it('goes through the Vite server relay when viaProxy is on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(MINIMAL_XLSX))
    vi.stubGlobal('fetch', fetchMock)
    await downloadExport({ ...API, viaProxy: true })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:5173/cle-proxy')
  })

  it('resolves a relative URL against the page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(MINIMAL_XLSX))
    vi.stubGlobal('fetch', fetchMock)
    await downloadExport({ ...API, url: '/mock-api/anomalies-export' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:5173/mock-api/anomalies-export')
  })

  it('refuses to call without a URL or without a token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await errorOf(downloadExport({ ...API, url: '' }))).code).toBe('CONFIGURATION')
    expect((await errorOf(downloadExport({ ...API, jwtToken: '  ' }))).code).toBe('CONFIGURATION')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a 401 by the token expiry when that is the case', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"erreur":"expiré"}', { status: 401 })))
    const e = await errorOf(downloadExport({ ...API, jwtToken: jwt({ exp: 1_000_000 }) }))
    expect(e.code).toBe('AUTHENTICATION')
    expect(e.status).toBe(401)
    expect(e.detail).toMatch(/a expiré le/)
  })

  it('surfaces the other HTTP errors with an excerpt of the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('Export indisponible', { status: 503, statusText: 'Service Unavailable' })))
    const e = await errorOf(downloadExport(API))
    expect(e.code).toBe('HTTP')
    expect(e.message).toMatch(/503/)
    expect(e.detail).toBe('Export indisponible')
  })

  it('suggests the relay when the browser blocks the call (CORS, network)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const e = await errorOf(downloadExport(API))
    expect(e.code).toBe('NETWORK')
    expect(e.detail).toMatch(/viaProxy/)
  })

  it('detects an HTML page or JSON returned instead of the workbook', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('<!doctype html><title>Connexion</title>', { status: 200 })))
    expect((await errorOf(downloadExport(API))).code).toBe('FORMAT')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('{"message":"ok"}', { status: 200 })))
    expect((await errorOf(downloadExport(API))).message).toMatch(/JSON/)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ArrayBuffer(0), { status: 200 })))
    expect((await errorOf(downloadExport(API))).message).toMatch(/vide/)
  })

  it('gives up beyond the configured timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      ),
    )
    const pending = errorOf(downloadExport({ ...API, timeoutMs: 1_000 }))
    await vi.advanceTimersByTimeAsync(1_001)
    expect((await pending).code).toBe('TIMEOUT')
  })
})
