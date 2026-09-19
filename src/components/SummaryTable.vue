<script setup lang="ts">
/**
 * « Category × severity » table: the exact equivalent of the workbook tables
 * (Synthèse par Équipe, and Machine × criticité of each team sheet).
 *
 * It doubles each chart: every value is readable without hovering, with the keyboard and by
 * a screen reader. A discreet bar in each cell places the value relative to the maximum of
 * its column.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink, useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { formatInteger, PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES, type Breakdown, type SummaryRow } from '@/domain/types'

const props = withDefaults(
  defineProps<{
    /** Heading of the first column: « Équipe » or « Machine ». */
    firstColumn: string
    rows: readonly SummaryRow[]
    total: Breakdown
    /** « Total Général » on the dashboard, « Total » on a team page. */
    totalLabel: string
    caption: string
    /** Destination of a row (dashboard → team page). */
    linkTo?: (key: string) => RouteLocationRaw | undefined
    /** Highlighted row (machine selected on a team page). */
    activeKey?: string | null
    selectable?: boolean
  }>(),
  { linkTo: undefined, activeKey: null, selectable: false },
)

const emit = defineEmits<{ select: [key: string] }>()
const router = useRouter()

const COLUMNS = [...PRIORITIES, 'total'] as const
type Column = (typeof COLUMNS)[number]

const maxima = computed(() => {
  const result: Record<Column, number> = { minor: 0, major: 0, blocking: 0, total: 0 }
  for (const row of props.rows) {
    for (const column of COLUMNS) result[column] = Math.max(result[column], row[column])
  }
  return result
})

function width(value: number, column: Column): string {
  const max = maxima.value[column]
  return max > 0 ? `${(value / max) * 100}%` : '0%'
}

function columnTone(column: Column): string {
  return column === 'total' ? 'neutral' : column
}

const interactive = computed(() => props.linkTo !== undefined || props.selectable)

function activate(key: string): void {
  const destination = props.linkTo?.(key)
  if (destination) void router.push(destination)
  else if (props.selectable) emit('select', key)
}
</script>

<template>
  <div class="summary">
    <table class="summary__table">
      <caption class="visually-hidden">
        {{ caption }}
      </caption>
      <thead>
        <tr>
          <th scope="col" class="summary__category">{{ firstColumn }}</th>
          <th v-for="priority in PRIORITIES" :key="priority" scope="col" class="summary__count">
            <span class="summary__header">
              <span class="dot" :class="`dot--${priority}`" />
              {{ PRIORITY_LABELS[priority].name }}
            </span>
            <span class="summary__threshold">{{ PRIORITY_LABELS[priority].threshold }}</span>
          </th>
          <th scope="col" class="summary__count">
            <span class="summary__header">Total</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          :class="{
            'summary__row--interactive': interactive,
            'summary__row--active': activeKey === row.key,
          }"
          @click="interactive && activate(row.key)"
        >
          <th scope="row" class="summary__category">
            <RouterLink
              v-if="linkTo?.(row.key)"
              :to="linkTo(row.key)!"
              class="summary__link"
              @click.stop
            >
              {{ row.label }}
              <Icon name="chevron" :size="14" />
            </RouterLink>
            <button
              v-else-if="selectable"
              type="button"
              class="summary__link summary__link--button"
              :aria-pressed="activeKey === row.key"
              @click.stop="activate(row.key)"
            >
              {{ row.label }}
            </button>
            <template v-else>{{ row.label }}</template>
          </th>
          <td v-for="column in COLUMNS" :key="column" class="summary__count">
            <span
              class="summary__bar"
              :class="`summary__bar--${columnTone(column)}`"
              :style="{ width: width(row[column], column) }"
              aria-hidden="true"
            />
            <span class="summary__value" :class="{ 'summary__value--zero': row[column] === 0 }">
              {{ formatInteger(row[column]) }}
            </span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="summary__category">{{ totalLabel }}</th>
          <td v-for="column in COLUMNS" :key="column" class="summary__count">
            <span class="summary__value">{{ formatInteger(total[column]) }}</span>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.summary {
  overflow-x: auto;
}

.summary__table {
  width: 100%;
  font-size: 13.5px;
}

th,
td {
  padding: 0 12px;
  height: 40px;
  border-bottom: 1px solid var(--gridline);
  text-align: left;
  font-weight: 400;
  white-space: nowrap;
}

thead th {
  height: 46px;
  padding-bottom: 6px;
  vertical-align: bottom;
  color: var(--text-secondary);
  font-size: 12.5px;
  border-bottom-color: var(--baseline);
}

.summary__category {
  padding-left: 4px;
  color: var(--text-primary);
  font-weight: 550;
}

thead .summary__category {
  color: var(--text-secondary);
  font-weight: 400;
}

.summary__count {
  position: relative;
  width: 17%;
  min-width: 76px;
  padding-left: 8px;
  text-align: right;
}

.summary__header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-weight: 600;
}

.summary__threshold {
  display: block;
  color: var(--text-muted);
  font-size: 11.5px;
}

/* Background bar: places the value within its column, never replacing the figure. */
.summary__bar {
  position: absolute;
  top: 7px;
  bottom: 7px;
  right: 6px;
  max-width: calc(100% - 12px);
  border-radius: 4px 0 0 4px;
  background: var(--sev-neutral);
  opacity: 0.2;
  transition: width 0.4s ease-out;
}

.summary__bar--minor {
  background: var(--sev-minor);
}

.summary__bar--major {
  background: var(--sev-major);
}

.summary__bar--blocking {
  background: var(--sev-blocking);
}

.summary__value {
  position: relative;
  font-variant-numeric: tabular-nums;
  font-weight: 550;
  color: var(--text-primary);
}

.summary__value--zero {
  font-weight: 400;
  color: var(--text-muted);
}

.summary__row--interactive {
  cursor: pointer;
}

.summary__row--interactive:hover th,
.summary__row--interactive:hover td {
  background: var(--surface-2);
}

.summary__row--active th,
.summary__row--active td,
.summary__row--active:hover th,
.summary__row--active:hover td {
  background: var(--accent-wash);
}

.summary__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  font: inherit;
  text-decoration: none;
}

.summary__link svg {
  opacity: 0;
  color: var(--text-muted);
  transition: opacity 0.15s;
}

tr:hover .summary__link svg,
.summary__link:focus-visible svg {
  opacity: 1;
}

.summary__link--button {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

tfoot th,
tfoot td {
  height: 44px;
  border-bottom: 0;
  border-top: 1px solid var(--baseline);
  font-weight: 650;
}

tfoot .summary__value {
  font-weight: 700;
}
</style>
