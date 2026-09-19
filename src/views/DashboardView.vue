<script setup lang="ts">
/**
 * « Tableau de Bord » page — sheet of the same name in the workbook:
 *  - 5 headline indicators (A4, C4, E4, G4, I4);
 *  - « Répartition des Anomalies par Équipe » chart;
 *  - « Synthèse par Équipe » table with its « Total Général » row.
 */
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import BreakdownBar from '@/components/BreakdownBar.vue'
import DataBanners from '@/components/DataBanners.vue'
import IndicatorTile from '@/components/IndicatorTile.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import SeverityChart, { type ChartMode } from '@/components/SeverityChart.vue'
import SeverityLegend from '@/components/SeverityLegend.vue'
import SummaryTable from '@/components/SummaryTable.vue'
import { formatInteger, PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES, type Priority, type SummaryRow } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const router = useRouter()

const mode = ref<ChartMode>('stacked')
const sort = ref<'workbook' | 'volume'>('workbook')
const visible = ref<Record<Priority, boolean>>({ minor: true, major: true, blocking: true })

const MODES = [
  { value: 'stacked', label: 'Empilé' },
  { value: 'grouped', label: 'Groupé' },
] as const
const SORTS = [
  { value: 'workbook', label: 'Ordre du classeur' },
  { value: 'volume', label: 'Volume décroissant' },
] as const

const indicators = computed(() => store.indicators)

/** The « volume » sort applies to the displayed severities: hiding Minor and Major ranks the teams by blocking ones. */
const chartRows = computed<SummaryRow[]>(() => {
  const rows = [...store.summary.rows]
  if (sort.value === 'volume') {
    const volume = (row: SummaryRow) => PRIORITIES.reduce((sum, p) => sum + (visible.value[p] ? row[p] : 0), 0)
    rows.sort((a, b) => volume(b) - volume(a))
  }
  return rows
})

const description = computed(
  () =>
    'Histogramme horizontal des anomalies par équipe, détaillées par criticité. ' +
    store.summary.rows
      .map((row) => `${row.label} : ${row.total} dont ${row.blocking} bloquantes`)
      .join(' ; ') +
    '.',
)

const slugByKey = computed(() => new Map(store.teams.map((team) => [team.key, team.slug])))

function teamRoute(key: string) {
  const slug = slugByKey.value.get(key)
  return slug ? { name: 'team', params: { slug } } : undefined
}

function openTeam(key: string): void {
  const route = teamRoute(key)
  if (route) void router.push(route)
}

/** Prioritized anomalies without a recognized team: the gap between the headline indicators and the « Total Général ». */
const outsideSummary = computed(() => {
  if (store.summary.outsideSummary === 0) return []
  const known = new Set(store.teams.map((team) => team.key))
  return store.anomalies.filter((a) => a.priority !== null && !known.has(a.teamKey))
})

watchEffect(() => {
  document.title = 'Tableau de bord · Suivi des anomalies'
})
</script>

<template>
  <div class="page">
    <header class="page__header">
      <h1 class="page__title">Tableau de bord</h1>
      <p class="page__subtitle">Suivi des anomalies — vue d'ensemble, toutes équipes</p>
    </header>

    <DataBanners />

    <section class="indicators" aria-label="Indicateurs clés">
      <IndicatorTile label="Total anomalies" :value="indicators.totalAnomalies" primary>
        <BreakdownBar
          :breakdown="{ minor: indicators.minor, major: indicators.major, blocking: indicators.blocking }"
          :total="indicators.totalAnomalies"
        />
      </IndicatorTile>
      <IndicatorTile
        label="Bloquantes"
        tone="blocking"
        :hint="PRIORITY_LABELS.blocking.threshold"
        :value="indicators.blocking"
        :total="indicators.totalAnomalies"
      />
      <IndicatorTile
        label="Majeures"
        tone="major"
        :hint="PRIORITY_LABELS.major.threshold"
        :value="indicators.major"
        :total="indicators.totalAnomalies"
      />
      <IndicatorTile
        label="Mineures"
        tone="minor"
        :hint="PRIORITY_LABELS.minor.threshold"
        :value="indicators.minor"
        :total="indicators.totalAnomalies"
      />
      <IndicatorTile
        label="Alerte > 4 jours"
        tone="alert"
        hint="Seuil Takt dépassé"
        :value="indicators.alertOver4Days"
        :total="indicators.totalAnomalies"
      />
    </section>

    <div class="page__grid">
      <section class="card" aria-labelledby="breakdown-title">
        <div class="card__header">
          <div>
            <h2 id="breakdown-title" class="card__title">Répartition des anomalies par équipe</h2>
            <p class="card__subtitle">Nombre d'anomalies par criticité · cliquer sur une équipe pour l'ouvrir</p>
          </div>
          <div class="card__controls">
            <SegmentedControl v-model="sort" :options="SORTS" label="Ordre des équipes" />
            <SegmentedControl v-model="mode" :options="MODES" label="Type d'histogramme" />
          </div>
        </div>
        <div class="card__body">
          <SeverityLegend v-model="visible" class="card__legend" />
          <SeverityChart
            :rows="chartRows"
            :mode="mode"
            :visible="visible"
            :description="description"
            click-hint="Cliquer pour ouvrir l'analyse de l'équipe"
            @select="openTeam"
          />
        </div>
      </section>

      <section class="card" aria-labelledby="summary-title">
        <div class="card__header">
          <div>
            <h2 id="summary-title" class="card__title">Synthèse par équipe</h2>
            <p class="card__subtitle">Les mêmes chiffres, en tableau</p>
          </div>
        </div>
        <div class="card__body">
          <SummaryTable
            first-column="Équipe"
            total-label="Total Général"
            caption="Synthèse par équipe : nombre d'anomalies par criticité"
            :rows="store.summary.rows"
            :total="store.summary.grandTotal"
            :link-to="teamRoute"
          />

          <details v-if="outsideSummary.length > 0" class="discrepancy">
            <summary>
              {{ formatInteger(outsideSummary.length) }} anomalie{{ outsideSummary.length > 1 ? 's' : '' }} sans équipe reconnue
              — comptée{{ outsideSummary.length > 1 ? 's' : '' }} dans les indicateurs, absente{{ outsideSummary.length > 1 ? 's' : '' }} de ce tableau
            </summary>
            <p class="discrepancy__explanation">
              Ces lignes du fichier ont une priorité mais pas d'équipe exploitable ; il s'agit en général d'une
              description sur plusieurs lignes qui a été fragmentée. Excel les traitait de la même façon : c'est
              l'écart entre « Total anomalies » et « Total Général ».
            </p>
            <table class="discrepancy__table">
              <thead>
                <tr>
                  <th scope="col">Ligne</th>
                  <th scope="col">Numéro</th>
                  <th scope="col">Équipe lue</th>
                  <th scope="col">Jours</th>
                  <th scope="col">Priorité</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in outsideSummary" :key="a.row">
                  <td>{{ a.row }}</td>
                  <td class="discrepancy__text" :title="a.number">{{ a.number || '–' }}</td>
                  <td>{{ a.team || '(vide)' }}</td>
                  <td>{{ a.businessDays ?? '–' }}</td>
                  <td>{{ a.priority ? PRIORITY_LABELS[a.priority].name : '' }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.indicators {
  display: grid;
  grid-template-columns: minmax(300px, 1.7fr) repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1320px) {
  .indicators {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .indicators > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .indicators {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.card__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.card__legend {
  margin: 0 0 8px -9px;
}

.discrepancy {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-2);
  font-size: 13px;
}

.discrepancy summary {
  color: var(--text-secondary);
  cursor: pointer;
}

.discrepancy__explanation {
  margin: 10px 0;
  color: var(--text-secondary);
}

.discrepancy__table {
  width: 100%;
  font-size: 12.5px;
}

.discrepancy__table th,
.discrepancy__table td {
  padding: 5px 8px 5px 0;
  border-top: 1px solid var(--gridline);
  text-align: left;
  font-variant-numeric: tabular-nums;
}

.discrepancy__table th {
  color: var(--text-muted);
  font-weight: 550;
}

.discrepancy__text {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
