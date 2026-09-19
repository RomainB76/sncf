<script setup lang="ts">
/** Navigation: one entry per sheet of the original workbook (Tableau de Bord + one per team). */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { formatInteger, PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()

const store = useAnomaliesStore()

const entries = computed(() =>
  store.teams.map((team) => {
    const row = store.summary.rows.find((r) => r.key === team.key)
    const total = row?.total ?? 0
    const blocking = row?.blocking ?? 0
    return {
      ...team,
      total,
      blocking,
      summary:
        `${team.label} : ${formatInteger(total)} anomalie${total > 1 ? 's' : ''}` +
        (blocking > 0 ? `, dont ${formatInteger(blocking)} bloquante${blocking > 1 ? 's' : ''}` : ''),
    }
  }),
)
</script>

<template>
  <div v-if="open" class="overlay" @click="$emit('close')" />
  <aside class="sidebar" :class="{ 'sidebar--open': open }" aria-label="Navigation principale">
    <div class="sidebar__brand">
      <svg class="sidebar__logo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--text-primary)" />
        <rect x="7" y="8" width="18" height="4" rx="2" fill="var(--sev-blocking)" />
        <rect x="7" y="14" width="12" height="4" rx="2" fill="var(--sev-major)" />
        <rect x="7" y="20" width="7" height="4" rx="2" fill="var(--sev-minor)" />
      </svg>
      <div>
        <p class="sidebar__name">Suivi des anomalies</p>
        <p class="sidebar__tagline">Anomalies industrielles</p>
      </div>
      <button type="button" class="button button--icon sidebar__close" aria-label="Fermer le menu" @click="$emit('close')">
        <Icon name="close" />
      </button>
    </div>

    <nav class="sidebar__nav">
      <RouterLink :to="{ name: 'dashboard' }" class="entry" @click="$emit('close')">
        <Icon name="dashboard" />
        <span class="entry__label">Tableau de bord</span>
        <span v-if="store.hasData" class="entry__count">{{ formatInteger(store.indicators.totalAnomalies) }}</span>
      </RouterLink>

      <p class="sidebar__section">Équipes</p>
      <RouterLink
        v-for="team in entries"
        :key="team.key"
        :to="{ name: 'team', params: { slug: team.slug } }"
        class="entry"
        :aria-label="team.summary"
        :title="team.summary"
        @click="$emit('close')"
      >
        <Icon name="team" />
        <span class="entry__label">{{ team.label }}</span>
        <span v-if="team.blocking > 0" class="entry__alert" aria-hidden="true" />
        <span v-if="store.hasData" class="entry__count" :class="{ 'entry__count--zero': team.total === 0 }">
          {{ formatInteger(team.total) }}
        </span>
      </RouterLink>
    </nav>

    <div class="sidebar__thresholds">
      <p class="sidebar__section">Criticité</p>
      <ul>
        <li v-for="priority in [...PRIORITIES].reverse()" :key="priority">
          <span class="dot" :class="`dot--${priority}`" />
          <span>{{ PRIORITY_LABELS[priority].name }}</span>
          <span class="sidebar__threshold">{{ PRIORITY_LABELS[priority].threshold }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-height);
  padding: 0 18px;
  flex: none;
}

.sidebar__logo {
  width: 30px;
  height: 30px;
  flex: none;
}

.sidebar__name {
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.2;
}

.sidebar__tagline {
  font-size: 12px;
  color: var(--text-muted);
}

.sidebar__close {
  display: none;
  margin-left: auto;
}

.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 10px 16px;
}

.sidebar__section {
  margin: 16px 10px 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 10px;
  border-radius: var(--radius-m);
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 550;
  text-decoration: none;
}

.entry svg {
  flex: none;
  color: var(--text-muted);
}

.entry:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.entry.router-link-exact-active {
  background: var(--accent-wash);
  color: var(--text-primary);
}

.entry.router-link-exact-active svg {
  color: var(--accent-strong);
}

.entry__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry__alert {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sev-blocking);
}

.entry__count {
  min-width: 24px;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.entry__count--zero {
  color: var(--text-muted);
}

.sidebar__thresholds {
  margin-top: auto;
  padding: 0 10px 18px;
  border-top: 1px solid var(--gridline);
}

.sidebar__thresholds ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 10px;
  list-style: none;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.sidebar__thresholds li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar__threshold {
  margin-left: auto;
  color: var(--text-muted);
}

.overlay {
  display: none;
}

@media (max-width: 960px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 0.2s ease-out;
    box-shadow: var(--shadow-pop);
  }

  .sidebar--open {
    transform: none;
  }

  .sidebar__close {
    display: inline-flex;
  }

  .overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 25;
    background: rgba(0, 0, 0, 0.4);
  }
}
</style>
