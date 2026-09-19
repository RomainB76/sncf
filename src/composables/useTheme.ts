/**
 * Thème clair / sombre. « auto » suit le système ; le choix explicite est mémorisé dans le
 * navigateur (simple préférence d'affichage, aucune donnée métier n'est stockée).
 */
import { computed, readonly, ref } from 'vue'
import type { NomTheme } from '@/theme/palette'

export type PreferenceTheme = 'auto' | NomTheme

const CLE_STOCKAGE = 'suivi-anomalies:theme'

function lirePreference(): PreferenceTheme {
  try {
    const valeur = localStorage.getItem(CLE_STOCKAGE)
    return valeur === 'light' || valeur === 'dark' ? valeur : 'auto'
  } catch {
    return 'auto'
  }
}

const requeteSombre =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const preference = ref<PreferenceTheme>(lirePreference())
const systemeSombre = ref(requeteSombre?.matches ?? false)
requeteSombre?.addEventListener('change', (e) => {
  systemeSombre.value = e.matches
})

const themeEffectif = computed<NomTheme>(() =>
  preference.value === 'auto' ? (systemeSombre.value ? 'dark' : 'light') : preference.value,
)

function definirTheme(valeur: PreferenceTheme): void {
  preference.value = valeur
  const racine = document.documentElement
  if (valeur === 'auto') racine.removeAttribute('data-theme')
  else racine.setAttribute('data-theme', valeur)
  try {
    if (valeur === 'auto') localStorage.removeItem(CLE_STOCKAGE)
    else localStorage.setItem(CLE_STOCKAGE, valeur)
  } catch {
    /* stockage indisponible (navigation privée) : le choix vaut pour la session */
  }
}

const SUIVANT: Record<PreferenceTheme, PreferenceTheme> = { auto: 'light', light: 'dark', dark: 'auto' }

export function useTheme() {
  return {
    preference: readonly(preference),
    themeEffectif,
    definirTheme,
    themeSuivant: () => definirTheme(SUIVANT[preference.value]),
  }
}
