/**
 * Display preferences.
 *
 * « Patterns » adds hatching to the Major and Blocking segments: a second channel, besides
 * colour, for colour-blind people, greyscale printing or the Windows high-contrast mode
 * (enabled automatically in that last case).
 */
import { computed, ref, watchEffect } from 'vue'

const STORAGE_KEY = 'anomaly-tracking:patterns'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const forcedColorsQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(forced-colors: active)')
    : null

const patternsChosen = ref(readStored())
const forcedColors = ref(forcedColorsQuery?.matches ?? false)
forcedColorsQuery?.addEventListener('change', (e) => {
  forcedColors.value = e.matches
})

const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
const reducedMotion = ref(reducedMotionQuery?.matches ?? false)
reducedMotionQuery?.addEventListener('change', (e) => {
  reducedMotion.value = e.matches
})

const narrowScreenQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)')
    : null
/** Phone in portrait mode: charts shorten their axis labels. */
const narrowScreen = ref(narrowScreenQuery?.matches ?? false)
narrowScreenQuery?.addEventListener('change', (e) => {
  narrowScreen.value = e.matches
})

/** `true` when patterns must be drawn (user choice or forced colours). */
const patterns = computed(() => patternsChosen.value || forcedColors.value)

// Mirrored on <html> so that the legend dots (CSS) follow the charts.
if (typeof document !== 'undefined') {
  watchEffect(() => document.documentElement.toggleAttribute('data-patterns', patterns.value))
}

export function usePreferences() {
  return {
    patternsChosen,
    patterns,
    reducedMotion,
    narrowScreen,
    togglePatterns(): void {
      patternsChosen.value = !patternsChosen.value
      try {
        localStorage.setItem(STORAGE_KEY, patternsChosen.value ? '1' : '0')
      } catch {
        /* storage unavailable: the choice holds for the session */
      }
    },
  }
}
