<script setup lang="ts">
/** Full-frame screen while no data is available: initial loading or error. */
import { ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const filePicker = ref<HTMLInputElement>()

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await store.importFile(file)
}
</script>

<template>
  <section v-if="store.state === 'error' && store.error" class="state" role="alert">
    <span class="state__icon state__icon--error"><Icon name="alert" :size="22" /></span>
    <h1 class="state__title">{{ store.error.title }}</h1>
    <p class="state__message">{{ store.error.message }}</p>
    <p v-if="store.error.detail" class="state__detail">{{ store.error.detail }}</p>

    <div class="state__actions">
      <button type="button" class="button button--primary" @click="store.refresh()">
        <Icon name="refresh" />
        Réessayer
      </button>
      <input
        ref="filePicker"
        type="file"
        class="visually-hidden"
        accept=".xlsx,.xlsm,.xls,.csv"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChosen"
      />
      <button type="button" class="button" @click="filePicker?.click()">
        <Icon name="import" />
        Importer un fichier Excel
      </button>
    </div>

    <p class="state__help">
      L'URL de l'API et le token JWT se règlent dans <code>public/config.local.json</code>, qui surcharge
      <code>public/config.json</code> (fichiers à côté de <code>index.html</code> une fois l'application déployée).
      Ils sont relus à chaque actualisation : inutile de redémarrer.
    </p>
  </section>

  <section v-else class="state" role="status">
    <span class="state__spinner" aria-hidden="true" />
    <p class="state__message">Récupération des données depuis clé…</p>
  </section>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 620px;
  margin: 12vh auto 0;
  padding: 0 24px;
  text-align: center;
}

.state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

.state__icon--error {
  background: var(--sev-blocking);
  color: #ffffff;
}

.state__title {
  font-size: 20px;
  font-weight: 650;
}

.state__message {
  color: var(--text-secondary);
}

.state__detail {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.state__help {
  margin-top: 14px;
  color: var(--text-muted);
  font-size: 13px;
}

code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.state__spinner {
  width: 30px;
  height: 30px;
  border: 3px solid var(--surface-3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
