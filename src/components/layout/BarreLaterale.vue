<script setup lang="ts">
/** Navigation : une entrée par feuille du classeur d'origine (Tableau de Bord + une par équipe). */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Icone from '@/components/Icone.vue'
import { entier, LIBELLES_PRIORITE } from '@/domain/libelles'
import { PRIORITES } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

defineProps<{ ouverte: boolean }>()
defineEmits<{ fermer: [] }>()

const store = useAnomaliesStore()

const entrees = computed(() =>
  store.equipes.map((equipe) => {
    const ligne = store.synthese.lignes.find((l) => l.cle === equipe.cle)
    const total = ligne?.total ?? 0
    const bloquantes = ligne?.Bloquante ?? 0
    return {
      ...equipe,
      total,
      bloquantes,
      resume:
        `${equipe.libelle} : ${entier(total)} anomalie${total > 1 ? 's' : ''}` +
        (bloquantes > 0 ? `, dont ${entier(bloquantes)} bloquante${bloquantes > 1 ? 's' : ''}` : ''),
    }
  }),
)
</script>

<template>
  <div v-if="ouverte" class="voile" @click="$emit('fermer')" />
  <aside class="laterale" :class="{ 'laterale--ouverte': ouverte }" aria-label="Navigation principale">
    <div class="laterale__marque">
      <svg class="laterale__logo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--text-primary)" />
        <rect x="7" y="8" width="18" height="4" rx="2" fill="var(--sev-bloquante)" />
        <rect x="7" y="14" width="12" height="4" rx="2" fill="var(--sev-majeure)" />
        <rect x="7" y="20" width="7" height="4" rx="2" fill="var(--sev-mineure)" />
      </svg>
      <div>
        <p class="laterale__nom">Suivi des anomalies</p>
        <p class="laterale__baseline">Anomalies industrielles</p>
      </div>
      <button type="button" class="bouton bouton--icone laterale__fermer" aria-label="Fermer le menu" @click="$emit('fermer')">
        <Icone nom="fermer" />
      </button>
    </div>

    <nav class="laterale__nav">
      <RouterLink :to="{ name: 'tableau-de-bord' }" class="entree" @click="$emit('fermer')">
        <Icone nom="tableau" />
        <span class="entree__libelle">Tableau de bord</span>
        <span v-if="store.aDesDonnees" class="entree__compte">{{ entier(store.indicateurs.totalAnomalies) }}</span>
      </RouterLink>

      <p class="laterale__section">Équipes</p>
      <RouterLink
        v-for="equipe in entrees"
        :key="equipe.cle"
        :to="{ name: 'equipe', params: { slug: equipe.slug } }"
        class="entree"
        :aria-label="equipe.resume"
        :title="equipe.resume"
        @click="$emit('fermer')"
      >
        <Icone nom="equipe" />
        <span class="entree__libelle">{{ equipe.libelle }}</span>
        <span v-if="equipe.bloquantes > 0" class="entree__alerte" aria-hidden="true" />
        <span v-if="store.aDesDonnees" class="entree__compte" :class="{ 'entree__compte--nul': equipe.total === 0 }">
          {{ entier(equipe.total) }}
        </span>
      </RouterLink>
    </nav>

    <div class="laterale__seuils">
      <p class="laterale__section">Criticité</p>
      <ul>
        <li v-for="priorite in [...PRIORITES].reverse()" :key="priorite">
          <span class="pastille" :class="`pastille--${LIBELLES_PRIORITE[priorite].classe}`" />
          <span>{{ priorite }}</span>
          <span class="laterale__seuil">{{ LIBELLES_PRIORITE[priorite].seuil }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.laterale {
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

.laterale__marque {
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-height);
  padding: 0 18px;
  flex: none;
}

.laterale__logo {
  width: 30px;
  height: 30px;
  flex: none;
}

.laterale__nom {
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.2;
}

.laterale__baseline {
  font-size: 12px;
  color: var(--text-muted);
}

.laterale__fermer {
  display: none;
  margin-left: auto;
}

.laterale__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 10px 16px;
}

.laterale__section {
  margin: 16px 10px 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.entree {
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

.entree svg {
  flex: none;
  color: var(--text-muted);
}

.entree:hover {
  background: var(--surface-2);
  color: var(--text-primary);
}

.entree.router-link-exact-active {
  background: var(--accent-wash);
  color: var(--text-primary);
}

.entree.router-link-exact-active svg {
  color: var(--accent-strong);
}

.entree__libelle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entree__alerte {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sev-bloquante);
}

.entree__compte {
  min-width: 24px;
  color: var(--text-secondary);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.entree__compte--nul {
  color: var(--text-muted);
}

.laterale__seuils {
  margin-top: auto;
  padding: 0 10px 18px;
  border-top: 1px solid var(--gridline);
}

.laterale__seuils ul {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 10px;
  list-style: none;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.laterale__seuils li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.laterale__seuil {
  margin-left: auto;
  color: var(--text-muted);
}

.voile {
  display: none;
}

@media (max-width: 960px) {
  .laterale {
    transform: translateX(-100%);
    transition: transform 0.2s ease-out;
    box-shadow: var(--shadow-pop);
  }

  .laterale--ouverte {
    transform: none;
  }

  .laterale__fermer {
    display: inline-flex;
  }

  .voile {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 25;
    background: rgba(0, 0, 0, 0.4);
  }
}
</style>
