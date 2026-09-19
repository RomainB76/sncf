import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ConfigurationError, loadConfiguration, mergeConfiguration } from '@/config/configuration'

const CONFIG_URL = 'http://localhost:5173/config.json'
const LOCAL_URL = 'http://localhost:5173/config.local.json'

/** Typical content of public/config.json (demo values, no secret). */
const CONFIG_JSON = {
  api: { url: '/mock-api/anomalies-export', jwtToken: 'demo-token', viaProxy: false, timeoutMs: 30_000 },
  data: { sheet: 'Données Globales', businessDays: 'auto', excludePublicHolidays: true },
  teams: ['AFFAIRES', 'CHAUDRO'],
  machines: ['Z27575', 'Z27665'],
  autoRefreshMinutes: 0,
}

/** Typical content of public/config.local.json: the real URL and the real token, nothing else. */
const OVERRIDE = {
  api: { url: 'https://cle.exemple.test/api/anomalies/export', jwtToken: 'local-token', viaProxy: true },
  machines: ['X76605'],
}

type Factory = () => Response

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function response(body: string, status: number, contentType?: string): Response {
  return new Response(body, { status, headers: contentType ? { 'content-type': contentType } : {} })
}

/** Mocks fetch: one response factory per URL (a fresh response on each call, a body can only be read once). */
function mockFetch(responses: Record<string, Factory>) {
  const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const factory = responses[url]
    return factory ? Promise.resolve(factory()) : Promise.reject(new TypeError(`Failed to fetch (${url})`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  // The loader resolves URLs against the page: the browser is simulated.
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' })
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mergeConfiguration', () => {
  it('merges api and data key by key, replaces the lists as a whole and keeps the rest', () => {
    expect(
      mergeConfiguration(CONFIG_JSON, {
        api: { url: 'https://cle.exemple.test/export', jwtToken: 'local-token' },
        data: { businessDays: 'computed' },
        teams: ['NUIT'],
      }),
    ).toEqual({
      api: { url: 'https://cle.exemple.test/export', jwtToken: 'local-token', viaProxy: false, timeoutMs: 30_000 },
      data: { sheet: 'Données Globales', businessDays: 'computed', excludePublicHolidays: true },
      teams: ['NUIT'],
      machines: ['Z27575', 'Z27665'],
      autoRefreshMinutes: 0,
    })
  })

  it('ignores an override, or a section, that is not an object', () => {
    expect(mergeConfiguration(CONFIG_JSON, null)).toEqual(CONFIG_JSON)
    expect(mergeConfiguration(CONFIG_JSON, ['api'])).toEqual(CONFIG_JSON)
    expect(mergeConfiguration(CONFIG_JSON, { api: 'text', data: null })).toEqual(CONFIG_JSON)
  })

  it('does not mutate the received objects', () => {
    const base = structuredClone(CONFIG_JSON)
    mergeConfiguration(base, OVERRIDE)
    expect(base).toEqual(CONFIG_JSON)
  })
})

describe('loadConfiguration', () => {
  it('reads config.json then config.local.json, without cache, and applies the override', async () => {
    const fetchMock = mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => json(OVERRIDE) })

    const config = await loadConfiguration()

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([CONFIG_URL, LOCAL_URL])
    for (const [, init] of fetchMock.mock.calls) expect(init?.cache).toBe('no-store')
    expect(config.api).toEqual({ ...OVERRIDE.api, timeoutMs: 30_000 })
    expect(config.data).toEqual(CONFIG_JSON.data)
    expect(config.teams).toEqual(CONFIG_JSON.teams)
    expect(config.machines).toEqual(['X76605'])
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps config.json as is when config.local.json is missing (404), without a warning', async () => {
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => response('Not Found', 404, 'text/plain') })

    const config = await loadConfiguration()

    expect(config.api).toEqual(CONFIG_JSON.api)
    expect(config.machines).toEqual(CONFIG_JSON.machines)
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignores an HTML page returned instead of config.local.json (index.html fallback of the Vite server)', async () => {
    const page = '<!doctype html>\n<html><head><title>Suivi des anomalies</title></head><body></body></html>'
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => response(page, 200, 'text/html; charset=utf-8') })
    expect((await loadConfiguration()).api).toEqual(CONFIG_JSON.api)

    // Even without an HTML Content-Type, the content is enough to recognize a page.
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => response(`  ${page}`, 200) })
    expect((await loadConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignores a malformed config.local.json and reports it in the console', async () => {
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => response('{ "api": { "url": ', 200, 'application/json') })
    expect((await loadConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toMatch(/config\.local\.json/)

    warn.mockClear()
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON), [LOCAL_URL]: () => json(['not', 'an', 'object']) })
    expect((await loadConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('ignores a network error on config.local.json', async () => {
    mockFetch({ [CONFIG_URL]: () => json(CONFIG_JSON) }) // any other URL is rejected
    expect((await loadConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(warn).not.toHaveBeenCalled()
  })

  it('still reports a missing or invalid config.json, without reading the override', async () => {
    const fetchMock = mockFetch({ [CONFIG_URL]: () => response('Not Found', 404), [LOCAL_URL]: () => json(OVERRIDE) })
    await expect(loadConfiguration()).rejects.toThrow(ConfigurationError)
    expect(fetchMock).toHaveBeenCalledOnce()

    mockFetch({ [CONFIG_URL]: () => response('{ not json', 200, 'application/json'), [LOCAL_URL]: () => json(OVERRIDE) })
    await expect(loadConfiguration()).rejects.toThrow(/JSON valide/)
  })
})
