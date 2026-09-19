<script setup lang="ts">
/** Top bar: state of the data source and global actions. */
import { computed, ref } from 'vue'
import Icon, { type IconName } from '@/components/Icon.vue'
import { usePreferences } from '@/composables/usePreferences'
import { useTheme, type ThemePreference } from '@/composables/useTheme'
import { formatInteger } from '@/domain/labels'
import { useAnomaliesStore } from '@/stores/anomalies'

defineEmits<{ openMenu: [] }>()

const store = useAnomaliesStore()
const { preference, nextTheme } = useTheme()
const { patternsChosen, togglePatterns } = usePreferences()

const filePicker = ref<HTMLInputElement>()

const THEMES: Record<ThemePreference, { icon: IconName; label: string }> = {
  auto: { icon: 'auto', label: 'Thème : automatique (suit le système)' },
  light: { icon: 'sun', label: 'Thème : clair' },
  dark: { icon: 'moon', label: 'Thème : sombre' },
}

const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const status = computed(() => {
  const source = store.source
  if (!source) return store.state === 'error' ? 'Aucune donnée chargée' : 'Récupération des données depuis clé…'
  const origin = source.type === 'api' ? 'Données clé' : `Fichier importé${source.name ? ` : ${source.name}` : ''}`
  return `${origin} · ${timeFormat.format(source.receivedAt).replace(' ', ' à ')} · ${formatInteger(store.anomalies.length)} lignes`
})

const busy = computed(() => store.state === 'loading' || store.refreshing)

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so that the same file can be chosen twice in a row.
  input.value = ''
  if (file) await store.importFile(file)
}
</script>

<template>
  <header class="toolbar">
    <button type="button" class="button button--icon toolbar__menu" aria-label="Ouvrir le menu" @click="$emit('openMenu')">
      <Icon name="menu" />
    </button>

    <div class="toolbar__status" role="status">
      <span class="toolbar__light" :class="{ 'toolbar__light--active': busy, 'toolbar__light--error': store.error !== null && !busy }" />
      <span class="toolbar__text">{{ status }}</span>
      <span v-if="store.isDemo && store.source?.type === 'api'" class="toolbar__demo" title="config.json pointe sur l'API simulée du serveur de développement">
        API simulée
      </span>
    </div>

    <div class="toolbar__actions">
      <input
        ref="filePicker"
        type="file"
        class="visually-hidden"
        accept=".xlsx,.xlsm,.xls,.csv"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChosen"
      />
      <button type="button" class="button toolbar__import" :disabled="busy" @click="filePicker?.click()">
        <Icon name="import" />
        <span>Importer un fichier</span>
      </button>
      <button type="button" class="button button--primary" :disabled="busy" @click="store.refresh()">
        <Icon name="refresh" :class="{ 'toolbar__spin': busy }" />
        <span>Actualiser</span>
      </button>
      <button
        type="button"
        class="button button--icon"
        :class="{ 'toolbar__toggle--active': patternsChosen }"
        :aria-pressed="patternsChosen"
        aria-label="Motifs d'accessibilité sur les graphiques (daltonisme, impression)"
        title="Motifs d'accessibilité sur les graphiques (daltonisme, impression)"
        @click="togglePatterns"
      >
        <Icon name="patterns" />
      </button>
      <button
        type="button"
        class="button button--icon"
        :aria-label="`${THEMES[preference].label}. Cliquer pour changer.`"
        :title="THEMES[preference].label"
        @click="nextTheme"
      >
        <Icon :name="THEMES[preference].icon" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-height);
  padding: 0 28px;
  background: color-mix(in srgb, var(--page) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.toolbar__menu {
  display: none;
}

.toolbar__status {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
  color: var(--text-secondary);
  font-size: 13px;
}

.toolbar__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar__light {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sev-minor);
}

.toolbar__light--active {
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}

.toolbar__light--error {
  background: var(--sev-blocking);
}

.toolbar__demo {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.toolbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.toolbar__toggle--active {
  background: var(--accent-wash);
  border-color: var(--accent);
}

.toolbar__spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 960px) {
  .toolbar {
    padding: 0 16px;
  }

  .toolbar__menu {
    display: inline-flex;
  }
}

@media (max-width: 720px) {
  .toolbar__import span,
  .button--primary span {
    display: none;
  }

  .toolbar__import,
  .button--primary {
    width: 36px;
    padding: 0;
  }
}
</style>
