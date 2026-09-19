/**
 * Light / dark theme. « auto » follows the system; an explicit choice is remembered in the
 * browser (a mere display preference, no business data is stored).
 */
import { computed, readonly, ref } from 'vue'
import type { ThemeName } from '@/theme/palette'

export type ThemePreference = 'auto' | ThemeName

const STORAGE_KEY = 'anomaly-tracking:theme'

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const preference = ref<ThemePreference>(readPreference())
const systemDark = ref(darkQuery?.matches ?? false)
darkQuery?.addEventListener('change', (e) => {
  systemDark.value = e.matches
})

const effectiveTheme = computed<ThemeName>(() =>
  preference.value === 'auto' ? (systemDark.value ? 'dark' : 'light') : preference.value,
)

function setTheme(value: ThemePreference): void {
  preference.value = value
  const root = document.documentElement
  if (value === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', value)
  try {
    if (value === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* storage unavailable (private browsing): the choice holds for the session */
  }
}

const NEXT: Record<ThemePreference, ThemePreference> = { auto: 'light', light: 'dark', dark: 'auto' }

export function useTheme() {
  return {
    preference: readonly(preference),
    effectiveTheme,
    setTheme,
    nextTheme: () => setTheme(NEXT[preference.value]),
  }
}
