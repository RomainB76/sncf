<script setup lang="ts">
/**
 * Detail of the anomalies of a team. In Excel, it was obtained by filtering the
 * « Données Globales » sheet; here the list filters by severity, machine and text, and sorts.
 */
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import { formatInteger, formatShortDate, PRIORITY_LABELS } from '@/domain/labels'
import { groupingKey } from '@/domain/normalization'
import { isInAlert } from '@/domain/priority'
import { PRIORITIES, type Anomaly, type Priority, type Reference } from '@/domain/types'

const props = defineProps<{
  anomalies: readonly Anomaly[]
  machines: readonly Reference[]
}>()

/** Filtered machine (normalized key); driven from the chart and the table of the page too. */
const machine = defineModel<string | null>('machine', { default: null })

type PriorityFilter = 'all' | Priority
const priorityFilter = ref<PriorityFilter>('all')
const search = ref('')

type SortKey = 'number' | 'priority' | 'days' | 'label' | 'trainset' | 'date' | 'author'
const sort = ref<{ key: SortKey; direction: 1 | -1 }>({ key: 'days', direction: -1 })

const PRIORITY_RANK: Record<Priority, number> = { minor: 1, major: 2, blocking: 3 }

const priorityOptions = computed(() => {
  const count = (p: Priority) => props.anomalies.filter((a) => a.priority === p).length
  return [
    { value: 'all' as PriorityFilter, label: `Toutes (${props.anomalies.length})` },
    ...[...PRIORITIES].reverse().map((p) => ({
      value: p as PriorityFilter,
      label: `${PRIORITY_LABELS[p].plural} (${count(p)})`,
    })),
  ]
})

const rows = computed(() => {
  const text = groupingKey(search.value)
  const filtered = props.anomalies.filter((a) => {
    if (priorityFilter.value !== 'all' && a.priority !== priorityFilter.value) return false
    if (machine.value !== null && a.trainsetKey !== machine.value) return false
    if (text === '') return true
    return groupingKey(
      [a.number, a.label, a.description, a.comment, a.createdBy, a.vehicle, a.trainset].join(' '),
    ).includes(text)
  })

  const { key, direction } = sort.value
  const compare = (a: Anomaly, b: Anomaly): number => {
    switch (key) {
      case 'number':
        return (Number(a.number) || 0) - (Number(b.number) || 0) || a.number.localeCompare(b.number, 'fr')
      case 'priority':
        return (a.priority ? PRIORITY_RANK[a.priority] : 0) - (b.priority ? PRIORITY_RANK[b.priority] : 0)
      case 'days':
        return (a.businessDays ?? -1) - (b.businessDays ?? -1)
      case 'label':
        return a.label.localeCompare(b.label, 'fr')
      case 'trainset':
        return a.trainset.localeCompare(b.trainset, 'fr') || a.vehicle.localeCompare(b.vehicle, 'fr')
      case 'date':
        return (a.creationDate ?? '').localeCompare(b.creationDate ?? '')
      case 'author':
        return a.createdBy.localeCompare(b.createdBy, 'fr')
    }
  }
  // Stable sort: on a tie, the order of the source file is kept.
  return [...filtered].sort((a, b) => compare(a, b) * direction || a.row - b.row)
})

function sortBy(key: SortKey): void {
  sort.value =
    sort.value.key === key
      ? { key, direction: sort.value.direction === 1 ? -1 : 1 }
      : { key, direction: key === 'days' || key === 'priority' || key === 'date' ? -1 : 1 }
}

function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sort.value.key !== key) return 'none'
  return sort.value.direction === 1 ? 'ascending' : 'descending'
}

const filtersActive = computed(
  () => priorityFilter.value !== 'all' || machine.value !== null || search.value.trim() !== '',
)

function resetFilters(): void {
  priorityFilter.value = 'all'
  machine.value = null
  search.value = ''
}

const SORTABLE_COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'number', label: 'N°', numeric: true },
  { key: 'priority', label: 'Priorité' },
  { key: 'days', label: 'Jours ouvrés', numeric: true },
  { key: 'label', label: 'Libellé' },
]
</script>

<template>
  <section class="detail">
    <div class="detail__filters">
      <SegmentedControl v-model="priorityFilter" :options="priorityOptions" label="Filtrer par priorité" />

      <label class="detail__field">
        <span class="visually-hidden">Filtrer par machine</span>
        <select
          :value="machine ?? ''"
          @change="machine = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">Toutes les machines</option>
          <option v-for="m in machines" :key="m.key" :value="m.key">{{ m.label }}</option>
        </select>
      </label>

      <label class="detail__field detail__field--search">
        <span class="visually-hidden">Rechercher dans les anomalies</span>
        <Icon name="search" :size="15" />
        <input v-model="search" type="search" placeholder="Rechercher (n°, libellé, description…)" />
      </label>

      <p class="detail__count" aria-live="polite">
        {{ formatInteger(rows.length) }} / {{ formatInteger(anomalies.length) }}
        <button v-if="filtersActive" type="button" class="detail__reset" @click="resetFilters">
          Réinitialiser
        </button>
      </p>
    </div>

    <div class="detail__scroll">
      <table class="detail__table">
        <caption class="visually-hidden">
          Détail des anomalies de l'équipe
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in SORTABLE_COLUMNS"
              :key="column.key"
              scope="col"
              :class="{ 'detail__num': column.numeric }"
              :aria-sort="ariaSort(column.key)"
            >
              <button type="button" class="detail__sort" @click="sortBy(column.key)">
                {{ column.label }}
                <Icon
                  v-if="sort.key === column.key"
                  :name="sort.direction === 1 ? 'sort-asc' : 'sort-desc'"
                  :size="13"
                />
              </button>
            </th>
            <th scope="col" class="detail__wide">Description</th>
            <th scope="col" :aria-sort="ariaSort('trainset')">
              <button type="button" class="detail__sort" @click="sortBy('trainset')">
                Rame / Véhicule
                <Icon v-if="sort.key === 'trainset'" :name="sort.direction === 1 ? 'sort-asc' : 'sort-desc'" :size="13" />
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('date')">
              <button type="button" class="detail__sort" @click="sortBy('date')">
                Créée le
                <Icon v-if="sort.key === 'date'" :name="sort.direction === 1 ? 'sort-asc' : 'sort-desc'" :size="13" />
              </button>
            </th>
            <th scope="col" :aria-sort="ariaSort('author')">
              <button type="button" class="detail__sort" @click="sortBy('author')">
                Créée par
                <Icon v-if="sort.key === 'author'" :name="sort.direction === 1 ? 'sort-asc' : 'sort-desc'" :size="13" />
              </button>
            </th>
            <th scope="col">SEF</th>
            <th scope="col" class="detail__wide">Commentaire</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.row">
            <td class="detail__num detail__number">{{ a.number || '–' }}</td>
            <td>
              <span v-if="a.priority" class="detail__priority">
                <span class="dot" :class="`dot--${a.priority}`" />
                {{ PRIORITY_LABELS[a.priority].name }}
              </span>
              <span v-else class="detail__muted" title="Moins d'un jour ouvré : pas encore de priorité">–</span>
            </td>
            <td class="detail__num">
              <span :class="{ 'detail__alert': isInAlert(a.businessDays) }">
                {{ a.businessDays === null ? '–' : formatInteger(a.businessDays) }}
              </span>
            </td>
            <td>{{ a.label || '–' }}</td>
            <td class="detail__wide"><p class="detail__text" :title="a.description">{{ a.description || '–' }}</p></td>
            <td>
              {{ a.trainset || '–' }}
              <span v-if="a.vehicle && a.vehicle !== a.trainset" class="detail__muted"> · {{ a.vehicle }}</span>
            </td>
            <td class="detail__date">{{ formatShortDate(a.creationDate) }}</td>
            <td>{{ a.createdBy || '–' }}</td>
            <td>{{ a.sef || '–' }}</td>
            <td class="detail__wide"><p class="detail__text" :title="a.comment">{{ a.comment || '–' }}</p></td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="10" class="detail__empty">
              {{ anomalies.length === 0 ? 'Aucune anomalie pour cette équipe.' : 'Aucune anomalie ne correspond aux filtres.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.detail__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 0 20px 14px;
}

.detail__field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  color: var(--text-muted);
}

.detail__field:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.detail__field select,
.detail__field input {
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13.5px;
}

.detail__field select option {
  background: var(--surface-1);
  color: var(--text-primary);
}

.detail__field--search {
  flex: 1 1 240px;
  max-width: 360px;
}

.detail__field--search input {
  flex: 1;
  min-width: 0;
}

.detail__count {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.detail__reset {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-strong);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}

.detail__scroll {
  overflow-x: auto;
  border-top: 1px solid var(--gridline);
}

.detail__table {
  width: 100%;
  min-width: 1080px;
  font-size: 13px;
}

th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--gridline);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}

th:first-child,
td:first-child {
  padding-left: 20px;
}

thead th {
  position: sticky;
  top: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  background: var(--surface-1);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 550;
  border-bottom-color: var(--baseline);
}

tbody tr:hover td {
  background: var(--surface-2);
}

.detail__sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.detail__sort:hover {
  color: var(--text-primary);
}

.detail__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.detail__number {
  color: var(--text-secondary);
}

.detail__priority {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 550;
}

.detail__alert {
  font-weight: 700;
}

.detail__muted {
  color: var(--text-muted);
}

.detail__date {
  font-variant-numeric: tabular-nums;
}

.detail__wide {
  white-space: normal;
  min-width: 220px;
  max-width: 380px;
}

.detail__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  white-space: pre-line;
}

.detail__empty {
  padding: 28px 20px;
  color: var(--text-muted);
  text-align: center;
}
</style>
