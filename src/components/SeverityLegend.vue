<script setup lang="ts">
/**
 * Legend of the severity charts. Always displayed (the identity of a series never relies on
 * colour alone); each entry is a button that hides or shows its series.
 */
import { PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES, type Priority } from '@/domain/types'

const visible = defineModel<Record<Priority, boolean>>({ required: true })

function toggle(priority: Priority): void {
  const next = { ...visible.value, [priority]: !visible.value[priority] }
  // At least one series stays displayed: hiding the last one shows everything again.
  visible.value = PRIORITIES.some((p) => next[p])
    ? next
    : { minor: true, major: true, blocking: true }
}
</script>

<template>
  <ul class="legend" aria-label="Légende : cliquer pour masquer ou afficher une criticité">
    <li v-for="priority in PRIORITIES" :key="priority">
      <button
        type="button"
        class="legend__entry"
        :class="{ 'legend__entry--hidden': !visible[priority] }"
        :aria-pressed="visible[priority]"
        @click="toggle(priority)"
      >
        <span class="dot" :class="`dot--${priority}`" />
        <span class="legend__name">{{ PRIORITY_LABELS[priority].name }}</span>
        <span class="legend__threshold">{{ PRIORITY_LABELS[priority].threshold }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend__entry {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.legend__entry:hover {
  background: var(--surface-2);
}

.legend__name {
  color: var(--text-primary);
  font-weight: 550;
}

.legend__threshold {
  color: var(--text-muted);
}

.legend__entry--hidden .dot {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--baseline);
}

.legend__entry--hidden .legend__name {
  color: var(--text-muted);
  text-decoration: line-through;
}
</style>
