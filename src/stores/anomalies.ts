/**
 * Central state of the application.
 *
 * Pipeline: config.json → clé GET (JWT) → workbook reading → anomalies.
 * Every indicator is a derived value (computed) of the anomaly list: as in Excel,
 * replacing the data is enough for everything to update.
 */
import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import {
  ConfigurationError,
  loadConfiguration,
  type Configuration,
} from '@/config/configuration'
import {
  globalIndicators,
  listMachines,
  listTeams,
  summaryByTeam,
  teamAnalysis,
} from '@/domain/indicators'
import type { Anomaly, Team, TeamAnalysis } from '@/domain/types'
import { ApiError, downloadExport } from '@/services/cleApi'
import { ReadError, readWorkbook, type ReadResult } from '@/services/excelReader'

export type LoadingState = 'initial' | 'loading' | 'ready' | 'error'

export interface DataSource {
  type: 'api' | 'file'
  /** Name of the received or imported file, when known. */
  name: string | null
  sheet: string
  receivedAt: Date
}

export interface DisplayableError {
  title: string
  message: string
  detail?: string
}

function toDisplayableError(e: unknown): DisplayableError {
  if (e instanceof ApiError) {
    const titles: Record<ApiError['code'], string> = {
      CONFIGURATION: 'Configuration incomplète',
      AUTHENTICATION: 'Authentification refusée',
      HTTP: 'Erreur renvoyée par clé',
      NETWORK: 'clé est injoignable',
      TIMEOUT: 'Délai dépassé',
      FORMAT: 'Réponse inattendue',
    }
    return { title: titles[e.code], message: e.message, detail: e.detail }
  }
  if (e instanceof ConfigurationError) {
    return { title: 'Configuration invalide', message: e.message, detail: e.detail }
  }
  if (e instanceof ReadError) {
    return { title: 'Fichier illisible', message: e.message, detail: e.detail }
  }
  return {
    title: 'Erreur inattendue',
    message: e instanceof Error ? e.message : String(e),
  }
}

export const useAnomaliesStore = defineStore('anomalies', () => {
  const configuration = shallowRef<Configuration | null>(null)
  const anomalies = shallowRef<readonly Anomaly[]>([])
  const state = ref<LoadingState>('initial')
  /** `true` during a call while data is already displayed (it stays visible). */
  const refreshing = ref(false)
  const error = ref<DisplayableError | null>(null)
  const source = shallowRef<DataSource | null>(null)
  const warnings = ref<string[]>([])
  const daysSourceCounts = ref<ReadResult['daysSourceCounts']>({ file: 0, computed: 0, missing: 0 })

  let pendingCall: AbortController | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  // --- Derived values: the equivalent of the computed sheets of the workbook ---

  const teams = computed<Team[]>(() =>
    listTeams(anomalies.value, configuration.value?.teams ?? []),
  )
  const machines = computed(() => listMachines(anomalies.value, configuration.value?.machines ?? []))
  const indicators = computed(() => globalIndicators(anomalies.value))
  const summary = computed(() => summaryByTeam(anomalies.value, teams.value))

  const analysesByTeam = computed(() => {
    const result = new Map<string, TeamAnalysis>()
    for (const team of teams.value) {
      result.set(team.key, teamAnalysis(anomalies.value, team.key, machines.value))
    }
    return result
  })

  const hasData = computed(() => source.value !== null)

  /** `true` while config.json points to the mock API of the development server. */
  const isDemo = computed(() => configuration.value?.api.url.includes('mock-api/') ?? false)

  function teamBySlug(slug: string): Team | undefined {
    return teams.value.find((t) => t.slug === slug)
  }

  function anomaliesOfTeam(key: string): Anomaly[] {
    return anomalies.value.filter((a) => a.teamKey === key)
  }

  // --- Loading ---

  function apply(result: ReadResult, newSource: Omit<DataSource, 'sheet'>): void {
    anomalies.value = result.anomalies
    warnings.value = result.warnings
    daysSourceCounts.value = result.daysSourceCounts
    source.value = { ...newSource, sheet: result.sheet }
    error.value = null
    state.value = 'ready'
  }

  function readOptions(config: Configuration) {
    return {
      sheet: config.data.sheet,
      businessDays: config.data.businessDays,
      excludePublicHolidays: config.data.excludePublicHolidays,
    }
  }

  async function run(task: (config: Configuration, signal: AbortSignal) => Promise<void>): Promise<void> {
    pendingCall?.abort()
    const controller = new AbortController()
    pendingCall = controller

    if (hasData.value) refreshing.value = true
    else state.value = 'loading'

    try {
      // Reloaded every time: a change of URL or token is taken into account immediately.
      const config = await loadConfiguration()
      configuration.value = config
      scheduleAutoRefresh(config.autoRefreshMinutes)
      await task(config, controller.signal)
    } catch (e) {
      if (controller.signal.aborted) return
      error.value = toDisplayableError(e)
      // Data already displayed stays on screen: the error shows up as a banner.
      if (!hasData.value) state.value = 'error'
    } finally {
      if (pendingCall === controller) {
        pendingCall = null
        refreshing.value = false
      }
    }
  }

  /** Fetches the export from clé and recomputes every indicator. */
  function refresh(): Promise<void> {
    return run(async (config, signal) => {
      const cleExport = await downloadExport(config.api, signal)
      const result = await readWorkbook(cleExport.content, readOptions(config))
      if (signal.aborted) return
      apply(result, { type: 'api', name: cleExport.fileName, receivedAt: cleExport.receivedAt })
    })
  }

  /** Loads a workbook chosen by the user (fallback when clé is unavailable). */
  function importFile(file: File): Promise<void> {
    return run(async (config, signal) => {
      const result = await readWorkbook(await file.arrayBuffer(), readOptions(config))
      if (signal.aborted) return
      apply(result, { type: 'file', name: file.name, receivedAt: new Date() })
    })
  }

  function dismissError(): void {
    if (hasData.value) error.value = null
  }

  // --- Automatic refresh (optional, useful on a workshop screen) ---

  let scheduledMinutes = 0
  function scheduleAutoRefresh(minutes: number): void {
    if (minutes === scheduledMinutes) return
    scheduledMinutes = minutes
    if (timer !== null) clearInterval(timer)
    timer = null
    if (minutes > 0) {
      timer = setInterval(() => {
        // A file imported by hand is never overwritten by an automatic refresh.
        if (source.value?.type !== 'file' && pendingCall === null) void refresh()
      }, minutes * 60_000)
    }
  }

  return {
    configuration,
    anomalies,
    state,
    refreshing,
    error,
    source,
    warnings,
    daysSourceCounts,
    teams,
    machines,
    indicators,
    summary,
    analysesByTeam,
    hasData,
    isDemo,
    teamBySlug,
    anomaliesOfTeam,
    refresh,
    importFile,
    dismissError,
  }
})
