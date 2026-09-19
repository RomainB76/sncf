/**
 * État central de l'application.
 *
 * Chaîne de traitement : config.json → GET clé (JWT) → lecture du classeur → anomalies.
 * Tous les indicateurs sont des valeurs dérivées (computed) de la liste d'anomalies :
 * comme dans Excel, il suffit de remplacer les données pour que tout se mette à jour.
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  chargerConfiguration,
  ErreurConfiguration,
  type Configuration,
} from '@/config/configuration'
import {
  analyseEquipe,
  indicateursGlobaux,
  listerEquipes,
  listerMachines,
  syntheseParEquipe,
} from '@/domain/indicateurs'
import type { AnalyseEquipe, Anomalie, Equipe } from '@/domain/types'
import { ErreurApi, telechargerExport } from '@/services/apiCle'
import { ErreurLecture, lireClasseur, type ResultatLecture } from '@/services/lectureExcel'

export type EtatChargement = 'initial' | 'chargement' | 'pret' | 'erreur'

export interface SourceDonnees {
  type: 'api' | 'fichier'
  /** Nom du fichier reçu ou importé, s'il est connu. */
  nom: string | null
  feuille: string
  recuLe: Date
}

export interface ErreurAffichable {
  titre: string
  message: string
  detail?: string
}

function erreurAffichable(e: unknown): ErreurAffichable {
  if (e instanceof ErreurApi) {
    const titres: Record<ErreurApi['code'], string> = {
      CONFIGURATION: 'Configuration incomplète',
      AUTHENTIFICATION: 'Authentification refusée',
      HTTP: 'Erreur renvoyée par clé',
      RESEAU: 'clé est injoignable',
      DELAI: 'Délai dépassé',
      FORMAT: 'Réponse inattendue',
    }
    return { titre: titres[e.code], message: e.message, detail: e.detail }
  }
  if (e instanceof ErreurConfiguration) {
    return { titre: 'Configuration invalide', message: e.message, detail: e.detail }
  }
  if (e instanceof ErreurLecture) {
    return { titre: 'Fichier illisible', message: e.message, detail: e.detail }
  }
  return {
    titre: 'Erreur inattendue',
    message: e instanceof Error ? e.message : String(e),
  }
}

export const useAnomaliesStore = defineStore('anomalies', () => {
  const configuration = shallowRef<Configuration | null>(null)
  const anomalies = shallowRef<readonly Anomalie[]>([])
  const etat = ref<EtatChargement>('initial')
  /** `true` pendant un appel alors que des données sont déjà affichées (elles restent visibles). */
  const enActualisation = ref(false)
  const erreur = ref<ErreurAffichable | null>(null)
  const source = shallowRef<SourceDonnees | null>(null)
  const avertissements = ref<string[]>([])
  const origineJours = ref<ResultatLecture['origineJours']>({ fichier: 0, calcul: 0, absent: 0 })

  let appelEnCours: AbortController | null = null
  let minuteur: ReturnType<typeof setInterval> | null = null

  // --- Valeurs dérivées : l'équivalent des feuilles calculées du classeur ---

  const equipes = computed<Equipe[]>(() =>
    listerEquipes(anomalies.value, configuration.value?.equipes ?? []),
  )
  const machines = computed(() => listerMachines(anomalies.value, configuration.value?.machines ?? []))
  const indicateurs = computed(() => indicateursGlobaux(anomalies.value))
  const synthese = computed(() => syntheseParEquipe(anomalies.value, equipes.value))

  const analysesParEquipe = computed(() => {
    const resultat = new Map<string, AnalyseEquipe>()
    for (const equipe of equipes.value) {
      resultat.set(equipe.cle, analyseEquipe(anomalies.value, equipe.cle, machines.value))
    }
    return resultat
  })

  const aDesDonnees = computed(() => source.value !== null)

  /** `true` tant que config.json pointe sur l'API simulée du serveur de développement. */
  const estDemonstration = computed(() => configuration.value?.api.url.includes('mock-api/') ?? false)

  function equipeParSlug(slug: string): Equipe | undefined {
    return equipes.value.find((e) => e.slug === slug)
  }

  function anomaliesDeLEquipe(cle: string): Anomalie[] {
    return anomalies.value.filter((a) => a.equipeCle === cle)
  }

  // --- Chargement ---

  function appliquer(resultat: ResultatLecture, nouvelleSource: Omit<SourceDonnees, 'feuille'>): void {
    anomalies.value = resultat.anomalies
    avertissements.value = resultat.avertissements
    origineJours.value = resultat.origineJours
    source.value = { ...nouvelleSource, feuille: resultat.feuille }
    erreur.value = null
    etat.value = 'pret'
  }

  function optionsDeLecture(config: Configuration) {
    return {
      feuille: config.donnees.feuille,
      joursOuvres: config.donnees.joursOuvres,
      exclureJoursFeries: config.donnees.exclureJoursFeries,
    }
  }

  async function executer(tache: (config: Configuration, signal: AbortSignal) => Promise<void>): Promise<void> {
    appelEnCours?.abort()
    const controleur = new AbortController()
    appelEnCours = controleur

    if (aDesDonnees.value) enActualisation.value = true
    else etat.value = 'chargement'

    try {
      // Relue à chaque fois : un changement d'URL ou de token est pris en compte immédiatement.
      const config = await chargerConfiguration()
      configuration.value = config
      planifierRafraichissement(config.rafraichissementAutoMinutes)
      await tache(config, controleur.signal)
    } catch (e) {
      if (controleur.signal.aborted) return
      erreur.value = erreurAffichable(e)
      // Des données déjà affichées restent à l'écran : l'erreur s'affiche en bandeau.
      if (!aDesDonnees.value) etat.value = 'erreur'
    } finally {
      if (appelEnCours === controleur) {
        appelEnCours = null
        enActualisation.value = false
      }
    }
  }

  /** Récupère l'export depuis clé et recalcule tous les indicateurs. */
  function actualiser(): Promise<void> {
    return executer(async (config, signal) => {
      const exportCle = await telechargerExport(config.api, signal)
      const resultat = await lireClasseur(exportCle.contenu, optionsDeLecture(config))
      if (signal.aborted) return
      appliquer(resultat, { type: 'api', nom: exportCle.nomFichier, recuLe: exportCle.recuLe })
    })
  }

  /** Charge un classeur choisi par l'utilisateur (secours quand clé est indisponible). */
  function importerFichier(fichier: File): Promise<void> {
    return executer(async (config, signal) => {
      const resultat = await lireClasseur(await fichier.arrayBuffer(), optionsDeLecture(config))
      if (signal.aborted) return
      appliquer(resultat, { type: 'fichier', nom: fichier.name, recuLe: new Date() })
    })
  }

  function fermerErreur(): void {
    if (aDesDonnees.value) erreur.value = null
  }

  // --- Actualisation automatique (optionnelle, utile sur un écran d'atelier) ---

  let minutesPlanifiees = 0
  function planifierRafraichissement(minutes: number): void {
    if (minutes === minutesPlanifiees) return
    minutesPlanifiees = minutes
    if (minuteur !== null) clearInterval(minuteur)
    minuteur = null
    if (minutes > 0) {
      minuteur = setInterval(() => {
        // Un fichier importé à la main n'est pas écrasé par une actualisation automatique.
        if (source.value?.type !== 'fichier' && appelEnCours === null) void actualiser()
      }, minutes * 60_000)
    }
  }

  return {
    configuration,
    anomalies,
    etat,
    enActualisation,
    erreur,
    source,
    avertissements,
    origineJours,
    equipes,
    machines,
    indicateurs,
    synthese,
    analysesParEquipe,
    aDesDonnees,
    estDemonstration,
    equipeParSlug,
    anomaliesDeLEquipe,
    actualiser,
    importerFichier,
    fermerErreur,
  }
})
