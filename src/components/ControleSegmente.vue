<script setup lang="ts" generic="T extends string">
/** Choix exclusif compact (groupe de boutons radio), navigable aux flèches du clavier. */
const props = defineProps<{
  options: readonly { valeur: T; libelle: string }[]
  /** Nom accessible du groupe (« Affichage », « Tri »…). */
  etiquette: string
}>()

const modele = defineModel<T>({ required: true })

function deplacer(evenement: KeyboardEvent, index: number): void {
  const sens =
    evenement.key === 'ArrowRight' || evenement.key === 'ArrowDown'
      ? 1
      : evenement.key === 'ArrowLeft' || evenement.key === 'ArrowUp'
        ? -1
        : 0
  if (sens === 0) return
  evenement.preventDefault()
  const n = props.options.length
  const suivant = props.options[(index + sens + n) % n]
  if (!suivant) return
  modele.value = suivant.valeur
  const groupe = (evenement.currentTarget as HTMLElement).parentElement
  groupe?.querySelectorAll<HTMLElement>('[role="radio"]')[(index + sens + n) % n]?.focus()
}
</script>

<template>
  <div class="segmente" role="radiogroup" :aria-label="etiquette">
    <button
      v-for="(option, index) in options"
      :key="option.valeur"
      type="button"
      role="radio"
      class="segmente__option"
      :class="{ 'segmente__option--actif': option.valeur === modele }"
      :aria-checked="option.valeur === modele"
      :tabindex="option.valeur === modele ? 0 : -1"
      @click="modele = option.valeur"
      @keydown="deplacer($event, index)"
    >
      {{ option.libelle }}
    </button>
  </div>
</template>

<style scoped>
.segmente {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-m);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.segmente__option {
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  white-space: nowrap;
}

.segmente__option:hover {
  color: var(--text-primary);
}

.segmente__option--actif {
  background: var(--surface-1);
  color: var(--text-primary);
  box-shadow:
    0 0 0 1px var(--border),
    0 1px 2px rgba(0, 0, 0, 0.08);
}
</style>
