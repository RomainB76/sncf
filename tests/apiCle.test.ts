import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigurationApi } from '@/config/configuration'
import { ErreurApi, inspecterJwt, telechargerExport } from '@/services/apiCle'

const jwt = (charge: object) =>
  `${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify(charge)).replace(/=+$/, '')}.signature`

const API: ConfigurationApi = {
  url: 'https://cle.exemple.test/api/anomalies/export',
  jwtToken: jwt({ sub: 'test' }),
  viaProxy: false,
  timeoutMs: 5_000,
}

/** Début d'un fichier zip (« PK ») : c'est ainsi que commence tout .xlsx. */
const XLSX_MINIMAL = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer

function reponse(corps: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(corps, init)
}

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurApi> {
  const e = await promesse.then(
    () => undefined,
    (raison: unknown) => raison,
  )
  expect(e).toBeInstanceOf(ErreurApi)
  return e as ErreurApi
}

beforeEach(() => {
  // Le service résout les URL par rapport à la page : on simule le navigateur.
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('inspecterJwt', () => {
  const maintenant = new Date('2026-09-18T10:00:00Z')

  it('lit la date d’expiration', () => {
    const exp = Date.parse('2026-09-18T09:00:00Z') / 1000
    expect(inspecterJwt(jwt({ exp }), maintenant)).toEqual({
      lisible: true,
      expire: true,
      expireLe: new Date('2026-09-18T09:00:00Z'),
    })
    expect(inspecterJwt(jwt({ exp: exp + 7200 }), maintenant).expire).toBe(false)
  })

  it('accepte un token sans expiration et un préfixe « Bearer » collé par erreur', () => {
    expect(inspecterJwt(`Bearer ${jwt({ sub: 'x' })}`)).toEqual({ lisible: true, expire: false, expireLe: null })
  })

  it('signale un token qui n’a pas la forme d’un JWT', () => {
    expect(inspecterJwt('pas-un-jwt').lisible).toBe(false)
    expect(inspecterJwt('a.b.c').lisible).toBe(false)
  })
})

describe('telechargerExport', () => {
  it('envoie un GET avec le token en Bearer et renvoie le classeur', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(
      reponse(XLSX_MINIMAL, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="export-cle.xlsx"',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchSimule)

    const resultat = await telechargerExport(API)

    expect(fetchSimule).toHaveBeenCalledOnce()
    const [url, init] = fetchSimule.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(API.url)
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API.jwtToken}`)
    expect(resultat.nomFichier).toBe('export-cle.xlsx')
    expect(resultat.contenu.byteLength).toBe(8)
  })

  it('ne double pas le préfixe « Bearer »', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(XLSX_MINIMAL))
    vi.stubGlobal('fetch', fetchSimule)
    await telechargerExport({ ...API, jwtToken: `Bearer ${API.jwtToken}` })
    const init = fetchSimule.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${API.jwtToken}`)
  })

  it('passe par le relais du serveur Vite quand viaProxy est actif', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(XLSX_MINIMAL))
    vi.stubGlobal('fetch', fetchSimule)
    await telechargerExport({ ...API, viaProxy: true })
    expect(fetchSimule.mock.calls[0]?.[0]).toBe('http://localhost:5173/proxy-cle')
  })

  it('résout une URL relative par rapport à la page', async () => {
    const fetchSimule = vi.fn().mockResolvedValue(reponse(XLSX_MINIMAL))
    vi.stubGlobal('fetch', fetchSimule)
    await telechargerExport({ ...API, url: '/mock-api/export-anomalies' })
    expect(fetchSimule.mock.calls[0]?.[0]).toBe('http://localhost:5173/mock-api/export-anomalies')
  })

  it('refuse d’appeler sans URL ou sans token', async () => {
    const fetchSimule = vi.fn()
    vi.stubGlobal('fetch', fetchSimule)
    expect((await erreurDe(telechargerExport({ ...API, url: '' }))).code).toBe('CONFIGURATION')
    expect((await erreurDe(telechargerExport({ ...API, jwtToken: '  ' }))).code).toBe('CONFIGURATION')
    expect(fetchSimule).not.toHaveBeenCalled()
  })

  it('explique un 401 par l’expiration du token quand c’est le cas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse('{"erreur":"expiré"}', { status: 401 })))
    const e = await erreurDe(telechargerExport({ ...API, jwtToken: jwt({ exp: 1_000_000 }) }))
    expect(e.code).toBe('AUTHENTIFICATION')
    expect(e.statut).toBe(401)
    expect(e.detail).toMatch(/a expiré le/)
  })

  it('remonte les autres erreurs HTTP avec un extrait de la réponse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse('Export indisponible', { status: 503, statusText: 'Service Unavailable' })))
    const e = await erreurDe(telechargerExport(API))
    expect(e.code).toBe('HTTP')
    expect(e.message).toMatch(/503/)
    expect(e.detail).toBe('Export indisponible')
  })

  it('suggère le relais quand le navigateur bloque l’appel (CORS, réseau)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const e = await erreurDe(telechargerExport(API))
    expect(e.code).toBe('RESEAU')
    expect(e.detail).toMatch(/viaProxy/)
  })

  it('détecte une page HTML ou du JSON renvoyés à la place du classeur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse('<!doctype html><title>Connexion</title>', { status: 200 })))
    expect((await erreurDe(telechargerExport(API))).code).toBe('FORMAT')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse('{"message":"ok"}', { status: 200 })))
    expect((await erreurDe(telechargerExport(API))).message).toMatch(/JSON/)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponse(new ArrayBuffer(0), { status: 200 })))
    expect((await erreurDe(telechargerExport(API))).message).toMatch(/vide/)
  })

  it('abandonne au-delà du délai configuré', async () => {
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
    const attente = erreurDe(telechargerExport({ ...API, timeoutMs: 1_000 }))
    await vi.advanceTimersByTimeAsync(1_001)
    expect((await attente).code).toBe('DELAI')
  })
})
