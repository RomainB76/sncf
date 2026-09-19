<script setup lang="ts">
/**
 * Banners displayed above the pages while data is already on screen: failure of the last
 * refresh (the displayed figures are then the previous ones) and warnings raised while
 * reading the file.
 */
import Icon from '@/components/Icon.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
</script>

<template>
  <div v-if="store.error || store.warnings.length > 0" class="banners">
    <div v-if="store.error" class="banner banner--error" role="alert">
      <span class="banner__icon"><Icon name="alert" :size="16" /></span>
      <div class="banner__text">
        <p>
          <strong>{{ store.error.title }}.</strong> {{ store.error.message }}
          Les données affichées sont celles du dernier chargement réussi.
        </p>
        <p v-if="store.error.detail" class="banner__detail">{{ store.error.detail }}</p>
      </div>
      <button type="button" class="button button--icon banner__close" aria-label="Masquer ce message" @click="store.dismissError()">
        <Icon name="close" :size="16" />
      </button>
    </div>

    <div v-for="(warning, i) in store.warnings" :key="i" class="banner" role="note">
      <span class="banner__icon banner__icon--info"><Icon name="info" :size="16" /></span>
      <p class="banner__text">{{ warning }}</p>
    </div>
  </div>
</template>

<style scoped>
.banners {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  font-size: 13.5px;
}

.banner--error {
  border-color: color-mix(in srgb, var(--sev-blocking) 45%, transparent);
  background: color-mix(in srgb, var(--sev-blocking) 7%, var(--surface-1));
}

.banner__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--sev-blocking);
  color: #ffffff;
}

.banner__icon--info {
  background: var(--surface-3);
  color: var(--text-primary);
}

.banner__text {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.banner__detail {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.banner__close {
  flex: none;
  width: 28px;
  height: 28px;
  border-color: transparent;
  background: transparent;
}
</style>
