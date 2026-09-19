<script setup lang="ts">
/**
 * Team page — the equivalent of the AFFAIRES, CHAUDRO, … PIECES DEPOSEES sheets:
 *  - « Machine × criticité » table and its « Total » row;
 *  - « Gravité des Anomalies par Machine - Équipe X » chart.
 * A single component serves every team: a team new in the data gets its page automatically.
 */
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { RouterLink } from 'vue-router'
import AnomaliesTable from '@/components/AnomaliesTable.vue'
import DataBanners from '@/components/DataBanners.vue'
import IndicatorTile from '@/components/IndicatorTile.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import SeverityChart, { type ChartMode } from '@/components/SeverityChart.vue'
import SeverityLegend from '@/components/SeverityLegend.vue'
import SummaryTable from '@/components/SummaryTable.vue'
import { emptyBreakdown } from '@/domain/indicators'
import { formatInteger, PRIORITY_LABELS } from '@/domain/labels'
import type { Priority } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

const props = defineProps<{ slug: string }>()

const store = useAnomaliesStore()

const mode = ref<ChartMode>('stacked')
const visible = ref<Record<Priority, boolean>>({ minor: true, major: true, blocking: true })
const filteredMachine = ref<string | null>(null)
const detailCard = ref<HTMLElement>()

const MODES = [
  { value: 'stacked', label: 'Empilé' },
  { value: 'grouped', label: 'Groupé' },
] as const

const team = computed(() => store.teamBySlug(props.slug))
const analysis = computed(
  () =>
    (team.value && store.analysesByTeam.get(team.value.key)) ?? {
      rows: [],
      total: emptyBreakdown(),
      outsideTable: 0,
    },
)
const anomalies = computed(() => (team.value ? store.anomaliesOfTeam(team.value.key) : []))
const total = computed(() => analysis.value.total)

const description = computed(
  () =>
    `Histogramme horizontal des anomalies de l'équipe ${team.value?.label ?? ''} par machine, détaillées par criticité. ` +
    analysis.value.rows.map((row) => `${row.label} : ${row.total} dont ${row.blocking} bloquantes`).join(' ; ') +
    '.',
)

const filteredMachineLabel = computed(
  () => store.machines.find((m) => m.key === filteredMachine.value)?.label ?? null,
)

/** Click on a machine (chart or table): filters the detail, a second click removes the filter. */
async function filterOnMachine(key: string): Promise<void> {
  filteredMachine.value = filteredMachine.value === key ? null : key
  if (filteredMachine.value === null) return
  await nextTick()
  detailCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(
  () => props.slug,
  () => {
    filteredMachine.value = null
  },
)

watchEffect(() => {
  document.title = `${team.value?.label ?? 'Équipe'} · Suivi des anomalies`
})
</script>

<template>
  <div v-if="team" class="page">
    <header class="page__header">
      <p class="page__kicker">Analyse équipe</p>
      <h1 class="page__title">{{ team.label }}</h1>
    </header>

    <DataBanners />

    <section class="indicators" aria-label="Indicateurs de l'équipe">
      <IndicatorTile label="Total équipe" hint="Anomalies priorisées" :value="total.total" />
      <IndicatorTile
        v-for="priority in (['blocking', 'major', 'minor'] as const)"
        :key="priority"
        :label="PRIORITY_LABELS[priority].plural"
        :tone="priority"
        :hint="PRIORITY_LABELS[priority].threshold"
        :value="total[priority]"
        :total="total.total"
      />
    </section>

    <div class="page__grid">
      <section class="card" aria-labelledby="severity-title">
        <div class="card__header">
          <div>
            <h2 id="severity-title" class="card__title">Gravité des anomalies par machine</h2>
            <p class="card__subtitle">Équipe {{ team.label }} · cliquer sur une machine pour filtrer le détail</p>
          </div>
          <SegmentedControl v-model="mode" :options="MODES" label="Type d'histogramme" />
        </div>
        <div class="card__body">
          <SeverityLegend v-model="visible" class="card__legend" />
          <SeverityChart
            :rows="analysis.rows"
            :mode="mode"
            :visible="visible"
            :description="description"
            click-hint="Cliquer pour filtrer le détail sur cette machine"
            empty-message="Aucune anomalie priorisée pour cette équipe."
            @select="filterOnMachine"
          />
        </div>
      </section>

      <section class="card" aria-labelledby="machines-title">
        <div class="card__header">
          <div>
            <h2 id="machines-title" class="card__title">Synthèse par machine</h2>
            <p class="card__subtitle">Les mêmes chiffres, en tableau</p>
          </div>
        </div>
        <div class="card__body">
          <SummaryTable
            first-column="Machine"
            total-label="Total"
            :caption="`Équipe ${team.label} : nombre d'anomalies par machine et par criticité`"
            :rows="analysis.rows"
            :total="analysis.total"
            :active-key="filteredMachine"
            selectable
            @select="filterOnMachine"
          />
          <p v-if="analysis.outsideTable > 0" class="note">
            {{ formatInteger(analysis.outsideTable) }} anomalie{{ analysis.outsideTable > 1 ? 's' : '' }} de l'équipe sans rame
            renseignée : absente{{ analysis.outsideTable > 1 ? 's' : '' }} de ce tableau, visible{{ analysis.outsideTable > 1 ? 's' : '' }} dans le détail ci-dessous.
          </p>
        </div>
      </section>
    </div>

    <section ref="detailCard" class="card card--detail" aria-labelledby="detail-title">
      <div class="card__header">
        <div>
          <h2 id="detail-title" class="card__title">Détail des anomalies</h2>
          <p class="card__subtitle">
            {{ formatInteger(anomalies.length) }} ligne{{ anomalies.length > 1 ? 's' : '' }} pour l'équipe
            <template v-if="filteredMachineLabel"> · filtrées sur la machine {{ filteredMachineLabel }}</template>
          </p>
        </div>
      </div>
      <AnomaliesTable v-model:machine="filteredMachine" :anomalies="anomalies" :machines="store.machines" />
    </section>
  </div>

  <div v-else class="page not-found">
    <h1 class="page__title">Équipe introuvable</h1>
    <p class="page__subtitle">Aucune équipe ne correspond à « {{ slug }} » dans les données chargées.</p>
    <RouterLink :to="{ name: 'dashboard' }" class="button">Retour au tableau de bord</RouterLink>
  </div>
</template>

<style scoped>
.indicators {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 860px) {
  .indicators {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.card__legend {
  margin: 0 0 8px -9px;
}

.card--detail {
  margin-top: 20px;
  scroll-margin-top: calc(var(--topbar-height) + 16px);
}

.card--detail .card__header {
  padding-bottom: 14px;
}

.note {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.not-found {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
</style>
