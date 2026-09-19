<script setup lang="ts">
/**
 * Répartition d'un total par criticité : une seule barre empilée à 100 %.
 * Les valeurs sont écrites sous la barre ; rien n'est réservé au survol.
 */
import { computed } from 'vue'
import { entier, LIBELLES_PRIORITE, part } from '@/domain/libelles'
import { PRIORITES, type Repartition } from '@/domain/types'

const props = defineProps<{
  repartition: Pick<Repartition, 'Mineure' | 'Majeure' | 'Bloquante'>
  /** Total de référence ; l'écart éventuel avec la somme des criticités est montré en gris. */
  total: number
}>()

const segments = computed(() => {
  const liste = PRIORITES.map((p) => ({
    cle: p as string,
    libelle: p as string,
    classe: LIBELLES_PRIORITE[p].classe as string,
    valeur: props.repartition[p],
  }))
  const sansPriorite =
    props.total - props.repartition.Mineure - props.repartition.Majeure - props.repartition.Bloquante
  if (sansPriorite > 0) {
    liste.push({ cle: 'aucune', libelle: 'Sans priorité (< 1 j)', classe: 'neutre', valeur: sansPriorite })
  }
  return liste
})
</script>

<template>
  <div class="repartition">
    <div class="repartition__barre" role="img" :aria-label="`Répartition par criticité de ${entier(total)} anomalies`">
      <span
        v-for="segment in segments.filter((s) => s.valeur > 0)"
        :key="segment.cle"
        class="repartition__segment"
        :class="`repartition__segment--${segment.classe}`"
        :style="{ flexGrow: segment.valeur }"
        :title="`${segment.libelle} : ${entier(segment.valeur)} (${part(segment.valeur, total)})`"
      />
    </div>
    <ul class="repartition__legende">
      <li v-for="segment in segments" :key="segment.cle">
        <span class="pastille" :class="`pastille--${segment.classe}`" />
        <span class="repartition__nom">{{ segment.libelle }}</span>
        <span class="repartition__valeur">{{ entier(segment.valeur) }}</span>
        <span class="repartition__part">{{ part(segment.valeur, total) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.repartition {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.repartition__barre {
  display: flex;
  gap: 2px;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface-3);
}

.repartition__segment {
  flex: 1 1 0;
  min-width: 3px;
  background: var(--sev-neutre);
  transition: flex-grow 0.4s ease-out;
}

.repartition__segment--mineure {
  background: var(--sev-mineure);
}

.repartition__segment--majeure {
  background: var(--sev-majeure);
}

.repartition__segment--bloquante {
  background: var(--sev-bloquante);
}

.repartition__legende {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}

.repartition__legende li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.repartition__nom {
  color: var(--text-secondary);
}

.repartition__valeur {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.repartition__part {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
