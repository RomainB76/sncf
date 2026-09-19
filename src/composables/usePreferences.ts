/**
 * Préférences d'affichage.
 *
 * « Motifs » ajoute des hachures aux segments Majeure et Bloquante : un second canal, en plus
 * de la couleur, pour les personnes daltoniennes, l'impression en niveaux de gris ou le mode
 * de contraste élevé de Windows (activé d'office dans ce dernier cas).
 */
import { computed, ref, watchEffect } from 'vue'

const CLE_STOCKAGE = 'suivi-anomalies:motifs'

function lire(): boolean {
  try {
    return localStorage.getItem(CLE_STOCKAGE) === '1'
  } catch {
    return false
  }
}

const requeteContraste =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(forced-colors: active)')
    : null

const motifsChoisis = ref(lire())
const contrasteForce = ref(requeteContraste?.matches ?? false)
requeteContraste?.addEventListener('change', (e) => {
  contrasteForce.value = e.matches
})

const requeteMouvement =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
const mouvementReduit = ref(requeteMouvement?.matches ?? false)
requeteMouvement?.addEventListener('change', (e) => {
  mouvementReduit.value = e.matches
})

const requeteEtroit =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)')
    : null
/** Téléphone en portrait : les graphiques compactent leurs libellés d'axe. */
const ecranEtroit = ref(requeteEtroit?.matches ?? false)
requeteEtroit?.addEventListener('change', (e) => {
  ecranEtroit.value = e.matches
})

/** `true` si les motifs doivent être dessinés (choix de l'utilisateur ou contraste forcé). */
const motifs = computed(() => motifsChoisis.value || contrasteForce.value)

// Reflété sur <html> pour que les pastilles de légende (CSS) suivent les graphiques.
if (typeof document !== 'undefined') {
  watchEffect(() => document.documentElement.toggleAttribute('data-motifs', motifs.value))
}

export function usePreferences() {
  return {
    motifsChoisis,
    motifs,
    mouvementReduit,
    ecranEtroit,
    basculerMotifs(): void {
      motifsChoisis.value = !motifsChoisis.value
      try {
        localStorage.setItem(CLE_STOCKAGE, motifsChoisis.value ? '1' : '0')
      } catch {
        /* stockage indisponible : le choix vaut pour la session */
      }
    },
  }
}
