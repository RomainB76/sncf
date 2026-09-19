/**
 * Service d'accès à clé : un GET authentifié par JWT qui renvoie le classeur Excel
 * contenant le jeu de données de la feuille « Données Globales ».
 *
 * L'URL et le token viennent de `public/config.json`, surchargé par `public/config.local.json`
 * (voir src/config/configuration.ts).
 */
import { CHEMIN_PROXY, urlRessource, type ConfigurationApi } from '@/config/configuration'

export type CodeErreurApi =
  | 'CONFIGURATION'
  | 'AUTHENTIFICATION'
  | 'HTTP'
  | 'RESEAU'
  | 'DELAI'
  | 'FORMAT'

/** Erreur d'appel à clé, avec un message destiné à l'utilisateur et une piste de résolution. */
export class ErreurApi extends Error {
  constructor(
    public readonly code: CodeErreurApi,
    message: string,
    public readonly detail?: string,
    public readonly statut?: number,
  ) {
    super(message)
    this.name = 'ErreurApi'
  }
}

export interface ExportCle {
  contenu: ArrayBuffer
  nomFichier: string | null
  typeContenu: string | null
  recuLe: Date
}

export interface InfosJwt {
  /** `false` si le token n'a pas la forme d'un JWT (trois segments, charge utile JSON). */
  lisible: boolean
  expireLe: Date | null
  expire: boolean
}

const TYPES_ACCEPTES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream;q=0.9',
  '*/*;q=0.8',
].join(', ')

/** Retire un éventuel préfixe « Bearer » collé par erreur dans la configuration. */
function tokenNu(token: string): string {
  return token.replace(/^bearer\s+/i, '').trim()
}

/**
 * Lit la date d'expiration (`exp`) d'un JWT, sans vérifier sa signature — c'est le rôle du serveur.
 * Sert uniquement à expliquer un refus d'authentification.
 */
export function inspecterJwt(token: string, maintenant: Date = new Date()): InfosJwt {
  const illisible: InfosJwt = { lisible: false, expireLe: null, expire: false }
  const segments = tokenNu(token).split('.')
  if (segments.length !== 3 || !segments[1]) return illisible

  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/')
    const complet = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const charge: unknown = JSON.parse(atob(complet))
    if (charge === null || typeof charge !== 'object') return illisible
    const exp = (charge as Record<string, unknown>).exp
    if (typeof exp !== 'number') return { lisible: true, expireLe: null, expire: false }
    const expireLe = new Date(exp * 1000)
    return { lisible: true, expireLe, expire: expireLe.getTime() <= maintenant.getTime() }
  } catch {
    return illisible
  }
}

function nomDeFichier(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const etendu = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(contentDisposition)
  if (etendu?.[1]) {
    try {
      return decodeURIComponent(etendu[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* on retombe sur la forme simple */
    }
  }
  const simple = /filename\s*=\s*("?)([^";]+)\1/i.exec(contentDisposition)
  return simple?.[2]?.trim() ?? null
}

async function extraitDuCorps(reponse: Response): Promise<string | undefined> {
  try {
    const corps = (await reponse.text()).replace(/\s+/g, ' ').trim()
    return corps === '' ? undefined : corps.slice(0, 300)
  } catch {
    return undefined
  }
}

/** Vérifie que le contenu reçu ressemble à un classeur, et non à une page HTML ou à du JSON. */
function verifierContenu(contenu: ArrayBuffer, typeContenu: string | null): void {
  if (contenu.byteLength === 0) {
    throw new ErreurApi('FORMAT', 'clé a répondu avec un contenu vide.')
  }

  const octets = new Uint8Array(contenu.slice(0, 512))
  const estZip = octets[0] === 0x50 && octets[1] === 0x4b // xlsx
  const estOle = octets[0] === 0xd0 && octets[1] === 0xcf && octets[2] === 0x11 && octets[3] === 0xe0 // xls
  if (estZip || estOle) return

  const debut = new TextDecoder('utf-8', { fatal: false }).decode(octets).replace(/^﻿/, '').trimStart()
  if (debut.startsWith('<') || debut.startsWith('{') || debut.startsWith('[')) {
    const nature = debut.startsWith('<') ? 'une page HTML/XML' : 'du JSON'
    throw new ErreurApi(
      'FORMAT',
      `clé a répondu avec ${nature} au lieu d'un fichier Excel.`,
      `Content-Type : ${typeContenu ?? 'inconnu'}. Début de la réponse : ${debut.replace(/\s+/g, ' ').slice(0, 200)}`,
    )
  }
  // Autre contenu (CSV par exemple) : on laisse le lecteur de classeur trancher.
}

/**
 * Télécharge l'export Excel de clé.
 * @throws ErreurApi avec un code exploitable par l'interface.
 */
export async function telechargerExport(
  api: ConfigurationApi,
  signalExterne?: AbortSignal,
): Promise<ExportCle> {
  if (api.url === '') {
    throw new ErreurApi(
      'CONFIGURATION',
      "L'URL de l'API clé n'est pas renseignée.",
      'Renseignez « api.url » dans public/config.local.json (à défaut, config.json).',
    )
  }
  const token = tokenNu(api.jwtToken)
  if (token === '') {
    throw new ErreurApi(
      'CONFIGURATION',
      "Le token JWT n'est pas renseigné.",
      'Renseignez « api.jwtToken » dans public/config.local.json (à défaut, config.json).',
    )
  }

  let cible: string
  try {
    cible = api.viaProxy ? urlRessource(CHEMIN_PROXY) : new URL(api.url, document.baseURI).toString()
  } catch {
    throw new ErreurApi('CONFIGURATION', `L'URL de l'API clé est invalide : « ${api.url} ».`)
  }

  const controleur = new AbortController()
  let delaiDepasse = false
  const minuteur = setTimeout(() => {
    delaiDepasse = true
    controleur.abort()
  }, api.timeoutMs)
  const annulerDepuisExterne = () => controleur.abort()
  signalExterne?.addEventListener('abort', annulerDepuisExterne, { once: true })

  try {
    let reponse: Response
    try {
      reponse = await fetch(cible, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: TYPES_ACCEPTES },
        cache: 'no-store',
        signal: controleur.signal,
      })
    } catch (e) {
      if (delaiDepasse) {
        throw new ErreurApi(
          'DELAI',
          `clé n'a pas répondu dans le délai imparti (${Math.round(api.timeoutMs / 1000)} s).`,
          'Le délai se règle avec « api.timeoutMs » dans config.json.',
        )
      }
      if (signalExterne?.aborted) throw e
      throw new ErreurApi(
        'RESEAU',
        'Impossible de joindre clé.',
        api.viaProxy
          ? 'Vérifiez l’URL « api.url » et que le serveur Vite est démarré (le relais /proxy-cle en dépend).'
          : 'Vérifiez l’URL et le réseau. Si clé ne renvoie pas d’en-têtes CORS, passez « api.viaProxy » à true dans config.json.',
      )
    }

    if (reponse.status === 401 || reponse.status === 403) {
      const jwt = inspecterJwt(token)
      let piste = 'Mettez à jour « api.jwtToken » dans public/config.local.json (à défaut, config.json).'
      if (!jwt.lisible) piste = `Le token configuré n'a pas la forme d'un JWT. ${piste}`
      else if (jwt.expire && jwt.expireLe) {
        piste = `Le token a expiré le ${jwt.expireLe.toLocaleString('fr-FR')}. ${piste}`
      }
      throw new ErreurApi(
        'AUTHENTIFICATION',
        `clé a refusé l'authentification (HTTP ${reponse.status}).`,
        piste,
        reponse.status,
      )
    }

    if (!reponse.ok) {
      const extrait = await extraitDuCorps(reponse)
      throw new ErreurApi(
        'HTTP',
        `clé a répondu avec une erreur HTTP ${reponse.status}${reponse.statusText ? ` (${reponse.statusText})` : ''}.`,
        extrait,
        reponse.status,
      )
    }

    const typeContenu = reponse.headers.get('content-type')
    const contenu = await reponse.arrayBuffer()
    verifierContenu(contenu, typeContenu)

    return {
      contenu,
      nomFichier: nomDeFichier(reponse.headers.get('content-disposition')),
      typeContenu,
      recuLe: new Date(),
    }
  } finally {
    clearTimeout(minuteur)
    signalExterne?.removeEventListener('abort', annulerDepuisExterne)
  }
}
