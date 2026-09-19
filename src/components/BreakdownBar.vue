<script setup lang="ts">
/**
 * Breakdown of a total by severity: a single bar stacked to 100 %.
 * The values are written under the bar; nothing is reserved to hovering.
 */
import { computed } from 'vue'
import { formatInteger, formatShare, PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES, type Breakdown } from '@/domain/types'

const props = defineProps<{
  breakdown: Pick<Breakdown, 'minor' | 'major' | 'blocking'>
  /** Reference total; the gap with the sum of the severities, if any, is shown in grey. */
  total: number
}>()

const segments = computed(() => {
  const list = PRIORITIES.map((p) => ({
    key: p as string,
    label: PRIORITY_LABELS[p].name,
    tone: p as string,
    value: props.breakdown[p],
  }))
  const unprioritized =
    props.total - props.breakdown.minor - props.breakdown.major - props.breakdown.blocking
  if (unprioritized > 0) {
    list.push({ key: 'none', label: 'Sans priorité (< 1 j)', tone: 'neutral', value: unprioritized })
  }
  return list
})
</script>

<template>
  <div class="breakdown">
    <div class="breakdown__bar" role="img" :aria-label="`Répartition par criticité de ${formatInteger(total)} anomalies`">
      <span
        v-for="segment in segments.filter((s) => s.value > 0)"
        :key="segment.key"
        class="breakdown__segment"
        :class="`breakdown__segment--${segment.tone}`"
        :style="{ flexGrow: segment.value }"
        :title="`${segment.label} : ${formatInteger(segment.value)} (${formatShare(segment.value, total)})`"
      />
    </div>
    <ul class="breakdown__legend">
      <li v-for="segment in segments" :key="segment.key">
        <span class="dot" :class="`dot--${segment.tone}`" />
        <span class="breakdown__name">{{ segment.label }}</span>
        <span class="breakdown__value">{{ formatInteger(segment.value) }}</span>
        <span class="breakdown__share">{{ formatShare(segment.value, total) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.breakdown__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface-3);
}

.breakdown__segment {
  flex: 1 1 0;
  min-width: 3px;
  background: var(--sev-neutral);
  transition: flex-grow 0.4s ease-out;
}

.breakdown__segment--minor {
  background: var(--sev-minor);
}

.breakdown__segment--major {
  background: var(--sev-major);
}

.breakdown__segment--blocking {
  background: var(--sev-blocking);
}

.breakdown__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}

.breakdown__legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.breakdown__name {
  color: var(--text-secondary);
}

.breakdown__value {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.breakdown__share {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
