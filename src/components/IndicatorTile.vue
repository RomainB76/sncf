<script setup lang="ts">
/**
 * Indicator tile: a key figure is not a chart, it is a well-staged number.
 * The value stays in regular ink; the severity colour is carried by the icon and the gauge,
 * always accompanied by the label.
 */
import { computed } from 'vue'
import Icon, { type IconName } from '@/components/Icon.vue'
import { formatInteger, formatShare } from '@/domain/labels'

export type TileTone = 'neutral' | 'minor' | 'major' | 'blocking' | 'alert'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    tone?: TileTone
    /** Threshold or precision displayed under the label (« > 4 j ouvrés »). */
    hint?: string
    /** Reference total: displays the gauge and the share as a percentage. */
    total?: number
    /** Main tile of the dashboard (bigger figure, free content below). */
    primary?: boolean
  }>(),
  { tone: 'neutral', hint: undefined, total: undefined, primary: false },
)

const ICONS: Record<TileTone, IconName> = {
  neutral: 'total',
  minor: 'minor',
  major: 'major',
  blocking: 'blocking',
  alert: 'alert',
}

/** An alert at zero is nothing alarming: the tile goes back to the neutral tone. */
const effectiveTone = computed<TileTone>(() =>
  props.tone === 'alert' && props.value === 0 ? 'neutral' : props.tone,
)
const icon = computed<IconName>(() =>
  props.tone === 'alert' && props.value === 0 ? 'check' : ICONS[props.tone],
)
const gaugeWidth = computed(() =>
  props.total && props.total > 0 ? `${Math.min(100, (props.value / props.total) * 100)}%` : '0%',
)
</script>

<template>
  <article class="tile" :class="[`tile--${effectiveTone}`, { 'tile--primary': primary }]">
    <header class="tile__header">
      <span class="tile__icon"><Icon :name="icon" :size="16" /></span>
      <span class="tile__titles">
        <span class="tile__label">{{ label }}</span>
        <span v-if="hint" class="tile__hint">{{ hint }}</span>
      </span>
    </header>

    <p class="tile__value">{{ formatInteger(value) }}</p>

    <div v-if="total !== undefined" class="tile__footer">
      <div class="tile__gauge" aria-hidden="true"><span :style="{ width: gaugeWidth }" /></div>
      <p class="tile__share">{{ formatShare(value, total) }} du total</p>
    </div>

    <div v-if="$slots.default" class="tile__content"><slot /></div>
  </article>
</template>

<style scoped>
.tile {
  --tone: var(--sev-neutral);
  --icon-ink: #0b0b0b;

  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 16px 18px 18px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-card);
}

.tile--minor {
  --tone: var(--sev-minor);
}

.tile--major {
  --tone: var(--sev-major);
}

.tile--blocking,
.tile--alert {
  --tone: var(--sev-blocking);
  --icon-ink: #ffffff;
}

.tile--alert {
  background: color-mix(in srgb, var(--sev-blocking) 7%, var(--surface-1));
  border-color: color-mix(in srgb, var(--sev-blocking) 38%, transparent);
}

.tile__header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.tile__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--tone);
  color: var(--icon-ink);
}

.tile--neutral .tile__icon {
  background: var(--surface-3);
  color: var(--text-primary);
}

.tile__titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.tile__label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.tile__hint {
  font-size: 12px;
  color: var(--text-muted);
}

.tile__value {
  font-size: 34px;
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.tile--primary .tile__value {
  font-size: 52px;
}

.tile__footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}

/* Gauge: the track is a lighter tone of the same hue as the fill. */
.tile__gauge {
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tone) 20%, transparent);
  overflow: hidden;
}

.tile__gauge span {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--tone);
  transition: width 0.4s ease-out;
}

.tile__share {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.tile__content {
  margin-top: auto;
}
</style>
