<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import EtatDonnees from '@/components/EtatDonnees.vue'
import BarreLaterale from '@/components/layout/BarreLaterale.vue'
import BarreOutils from '@/components/layout/BarreOutils.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const route = useRoute()
const menuOuvert = ref(false)

watch(
  () => route.fullPath,
  () => {
    menuOuvert.value = false
  },
)

// Au démarrage : appel de clé, puis calcul des indicateurs.
onMounted(() => {
  void store.actualiser()
})
</script>

<template>
  <a class="evitement" href="#contenu">Aller au contenu</a>
  <BarreLaterale :ouverte="menuOuvert" @fermer="menuOuvert = false" />

  <div class="cadre">
    <BarreOutils @ouvrir-menu="menuOuvert = true" />
    <!-- Pendant une actualisation, l'affichage précédent reste en place, simplement atténué. -->
    <main id="contenu" class="cadre__contenu" :class="{ 'cadre__contenu--actualisation': store.enActualisation }" tabindex="-1">
      <RouterView v-if="store.aDesDonnees" />
      <EtatDonnees v-else />
    </main>
  </div>
</template>

<style scoped>
.cadre {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
}

.cadre__contenu {
  outline: none;
  transition: opacity 0.2s;
}

.cadre__contenu--actualisation {
  opacity: 0.55;
}

.evitement {
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

.evitement:focus {
  transform: none;
}

@media (max-width: 960px) {
  .cadre {
    margin-left: 0;
  }
}
</style>
