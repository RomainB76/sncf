<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import DataState from '@/components/DataState.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import Toolbar from '@/components/layout/Toolbar.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const route = useRoute()
const menuOpen = ref(false)

watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

// On startup: call clé, then compute the indicators.
onMounted(() => {
  void store.refresh()
})
</script>

<template>
  <a class="skip-link" href="#content">Aller au contenu</a>
  <Sidebar :open="menuOpen" @close="menuOpen = false" />

  <div class="frame">
    <Toolbar @open-menu="menuOpen = true" />
    <!-- During a refresh, the previous display stays in place, merely dimmed. -->
    <main id="content" class="frame__content" :class="{ 'frame__content--refreshing': store.refreshing }" tabindex="-1">
      <RouterView v-if="store.hasData" />
      <DataState v-else />
    </main>
  </div>
</template>

<style scoped>
.frame {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
}

.frame__content {
  outline: none;
  transition: opacity 0.2s;
}

.frame__content--refreshing {
  opacity: 0.55;
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 50;
  padding: 8px 12px;
  border-radius: var(--radius-m);
  background: var(--primary-bg);
  color: var(--on-accent);
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: none;
}

@media (max-width: 960px) {
  .frame {
    margin-left: 0;
  }
}
</style>
