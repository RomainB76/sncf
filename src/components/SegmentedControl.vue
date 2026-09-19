<script setup lang="ts" generic="T extends string">
/** Compact exclusive choice (radio button group), navigable with the keyboard arrows. */
const props = defineProps<{
  options: readonly { value: T; label: string }[]
  /** Accessible name of the group (« Affichage », « Tri »…). */
  label: string
}>()

const model = defineModel<T>({ required: true })

function move(event: KeyboardEvent, index: number): void {
  const direction =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0
  if (direction === 0) return
  event.preventDefault()
  const n = props.options.length
  const next = props.options[(index + direction + n) % n]
  if (!next) return
  model.value = next.value
  const group = (event.currentTarget as HTMLElement).parentElement
  group?.querySelectorAll<HTMLElement>('[role="radio"]')[(index + direction + n) % n]?.focus()
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      class="segmented__option"
      :class="{ 'segmented__option--active': option.value === model }"
      :aria-checked="option.value === model"
      :tabindex="option.value === model ? 0 : -1"
      @click="model = option.value"
      @keydown="move($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-m);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.segmented__option {
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

.segmented__option:hover {
  color: var(--text-primary);
}

.segmented__option--active {
  background: var(--surface-1);
  color: var(--text-primary);
  box-shadow:
    0 0 0 1px var(--border),
    0 1px 2px rgba(0, 0, 0, 0.08);
}
</style>
