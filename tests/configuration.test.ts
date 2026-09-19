import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { chargerConfiguration, ErreurConfiguration, fusionnerConfiguration } from '@/config/configuration'

const URL_CONFIG = 'http://localhost:5173/config.json'
const URL_LOCALE = 'http://localhost:5173/config.local.json'

/** Contenu type de public/config.json (valeurs de démonstration, aucun secret). */
const CONFIG_JSON = {
  api: { url: '/mock-api/export-anomalies', jwtToken: 'jeton-de-demonstration', viaProxy: false, timeoutMs: 30_000 },
  donnees: { feuille: 'Données Globales', joursOuvres: 'auto', exclureJoursFeries: true },
  equipes: ['AFFAIRES', 'CHAUDRO'],
  machines: ['Z27575', 'Z27665'],
  rafraichissementAutoMinutes: 0,
}

/** Contenu type de public/config.local.json : la vraie URL et le vrai token, rien d'autre. */
const SURCHARGE = {
  api: { url: 'https://cle.exemple.test/api/anomalies/export', jwtToken: 'jeton-local', viaProxy: true },
  machines: ['X76605'],
}

type Fabrique = () => Response

function json(corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: 200, headers: { 'content-type': 'application/json' } })
}

function reponse(corps: string, statut: number, typeContenu?: string): Response {
  return new Response(corps, { status: statut, headers: typeContenu ? { 'content-type': typeContenu } : {} })
}

/** Simule fetch : une fabrique de réponse par URL (réponse neuve à chaque appel, un corps ne se lit qu'une fois). */
function simulerFetch(reponses: Record<string, Fabrique>) {
  const fetchSimule = vi.fn((entree: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url
    const fabrique = reponses[url]
    return fabrique ? Promise.resolve(fabrique()) : Promise.reject(new TypeError(`Failed to fetch (${url})`))
  })
  vi.stubGlobal('fetch', fetchSimule)
  return fetchSimule
}

let avertir: MockInstance<typeof console.warn>

beforeEach(() => {
  // Le chargeur résout les URL par rapport à la page : on simule le navigateur.
  vi.stubGlobal('document', { baseURI: 'http://localhost:5173/' })
  avertir = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fusionnerConfiguration', () => {
  it('fusionne api et donnees clé par clé, remplace les listes en bloc et laisse le reste', () => {
    expect(
      fusionnerConfiguration(CONFIG_JSON, {
        api: { url: 'https://cle.exemple.test/export', jwtToken: 'jeton-local' },
        donnees: { joursOuvres: 'calcul' },
        equipes: ['NUIT'],
      }),
    ).toEqual({
      api: { url: 'https://cle.exemple.test/export', jwtToken: 'jeton-local', viaProxy: false, timeoutMs: 30_000 },
      donnees: { feuille: 'Données Globales', joursOuvres: 'calcul', exclureJoursFeries: true },
      equipes: ['NUIT'],
      machines: ['Z27575', 'Z27665'],
      rafraichissementAutoMinutes: 0,
    })
  })

  it('ignore une surcharge, ou une section, qui n’est pas un objet', () => {
    expect(fusionnerConfiguration(CONFIG_JSON, null)).toEqual(CONFIG_JSON)
    expect(fusionnerConfiguration(CONFIG_JSON, ['api'])).toEqual(CONFIG_JSON)
    expect(fusionnerConfiguration(CONFIG_JSON, { api: 'texte', donnees: null })).toEqual(CONFIG_JSON)
  })

  it('ne modifie pas les objets reçus', () => {
    const base = structuredClone(CONFIG_JSON)
    fusionnerConfiguration(base, SURCHARGE)
    expect(base).toEqual(CONFIG_JSON)
  })
})

describe('chargerConfiguration', () => {
  it('lit config.json puis config.local.json, sans cache, et applique la surcharge', async () => {
    const fetchSimule = simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => json(SURCHARGE) })

    const config = await chargerConfiguration()

    expect(fetchSimule.mock.calls.map(([url]) => url)).toEqual([URL_CONFIG, URL_LOCALE])
    for (const [, init] of fetchSimule.mock.calls) expect(init?.cache).toBe('no-store')
    expect(config.api).toEqual({ ...SURCHARGE.api, timeoutMs: 30_000 })
    expect(config.donnees).toEqual(CONFIG_JSON.donnees)
    expect(config.equipes).toEqual(CONFIG_JSON.equipes)
    expect(config.machines).toEqual(['X76605'])
    expect(avertir).not.toHaveBeenCalled()
  })

  it('garde config.json tel quel quand config.local.json est absent (404), sans avertissement', async () => {
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => reponse('Not Found', 404, 'text/plain') })

    const config = await chargerConfiguration()

    expect(config.api).toEqual(CONFIG_JSON.api)
    expect(config.machines).toEqual(CONFIG_JSON.machines)
    expect(avertir).not.toHaveBeenCalled()
  })

  it('ignore une page HTML renvoyée à la place de config.local.json (repli index.html du serveur Vite)', async () => {
    const page = '<!doctype html>\n<html><head><title>Suivi des anomalies</title></head><body></body></html>'
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => reponse(page, 200, 'text/html; charset=utf-8') })
    expect((await chargerConfiguration()).api).toEqual(CONFIG_JSON.api)

    // Même sans Content-Type HTML, le contenu suffit à reconnaître une page.
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => reponse(`  ${page}`, 200) })
    expect((await chargerConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(avertir).not.toHaveBeenCalled()
  })

  it('ignore un config.local.json mal formé, en le signalant en console', async () => {
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => reponse('{ "api": { "url": ', 200, 'application/json') })
    expect((await chargerConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(avertir).toHaveBeenCalledOnce()
    expect(avertir.mock.calls[0]?.[0]).toMatch(/config\.local\.json/)

    avertir.mockClear()
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON), [URL_LOCALE]: () => json(['pas', 'un', 'objet']) })
    expect((await chargerConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(avertir).toHaveBeenCalledOnce()
  })

  it('ignore une erreur réseau sur config.local.json', async () => {
    simulerFetch({ [URL_CONFIG]: () => json(CONFIG_JSON) }) // toute autre URL est rejetée
    expect((await chargerConfiguration()).api).toEqual(CONFIG_JSON.api)
    expect(avertir).not.toHaveBeenCalled()
  })

  it('signale toujours un config.json absent ou invalide, sans lire la surcharge', async () => {
    const fetchSimule = simulerFetch({ [URL_CONFIG]: () => reponse('Not Found', 404), [URL_LOCALE]: () => json(SURCHARGE) })
    await expect(chargerConfiguration()).rejects.toThrow(ErreurConfiguration)
    expect(fetchSimule).toHaveBeenCalledOnce()

    simulerFetch({ [URL_CONFIG]: () => reponse('{ pas du json', 200, 'application/json'), [URL_LOCALE]: () => json(SURCHARGE) })
    await expect(chargerConfiguration()).rejects.toThrow(/JSON valide/)
  })
})
