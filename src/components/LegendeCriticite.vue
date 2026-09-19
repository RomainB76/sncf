<script setup lang="ts">
/**
 * Légende des graphiques de criticité. Toujours affichée (l'identité d'une série ne repose
 * jamais sur la couleur seule) ; chaque entrée est un bouton qui masque/affiche sa série.
 */
import { LIBELLES_PRIORITE } from '@/domain/libelles'
import { PRIORITES, type Priorite } from '@/domain/types'

const visibles = defineModel<Record<Priorite, boolean>>({ required: true })

function basculer(priorite: Priorite): void {
  const suivant = { ...visibles.value, [priorite]: !visibles.value[priorite] }
  // Au moins une série reste affichée : masquer la dernière réaffiche tout.
  visibles.value = PRIORITES.some((p) => suivant[p])
    ? suivant
    : { Mineure: true, Majeure: true, Bloquante: true }
}
</script>

<template>
  <ul class="legende" aria-label="Légende : cliquer pour masquer ou afficher une criticité">
    <li v-for="priorite in PRIORITES" :key="priorite">
      <button
        type="button"
        class="legende__entree"
        :class="{ 'legende__entree--masquee': !visibles[priorite] }"
        :aria-pressed="visibles[priorite]"
        @click="basculer(priorite)"
      >
        <span class="pastille" :class="`pastille--${LIBELLES_PRIORITE[priorite].classe}`" />
        <span class="legende__nom">{{ priorite }}</span>
        <span class="legende__seuil">{{ LIBELLES_PRIORITE[priorite].seuil }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.legende {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legende__entree {
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

.legende__entree:hover {
  background: var(--surface-2);
}

.legende__nom {
  color: var(--text-primary);
  font-weight: 550;
}

.legende__seuil {
  color: var(--text-muted);
}

.legende__entree--masquee .pastille {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--baseline);
}

.legende__entree--masquee .legende__nom {
  color: var(--text-muted);
  text-decoration: line-through;
}
</style>
