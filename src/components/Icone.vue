<script setup lang="ts">
/** Icônes au trait, dessinées sur une grille de 24 px. Décoratives : le texte voisin porte le sens. */
export type NomIcone =
  | 'tableau'
  | 'equipe'
  | 'actualiser'
  | 'importer'
  | 'soleil'
  | 'lune'
  | 'auto'
  | 'motifs'
  | 'alerte'
  | 'bloquante'
  | 'majeure'
  | 'mineure'
  | 'total'
  | 'valide'
  | 'fermer'
  | 'chevron'
  | 'menu'
  | 'recherche'
  | 'tri-asc'
  | 'tri-desc'
  | 'info'

withDefaults(defineProps<{ nom: NomIcone; taille?: number }>(), { taille: 18 })

const TRACES: Record<NomIcone, string[]> = {
  tableau: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 11h7v9h-7z', 'M4 14h7v6H4z'],
  equipe: [
    'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20',
    'M10 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z',
    'M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4',
    'M15.4 5.1a3.25 3.25 0 0 1 0 6.3',
  ],
  actualiser: ['M20 11a8 8 0 0 0-14.3-4.3L4 8.5', 'M4 4v4.5h4.5', 'M4 13a8 8 0 0 0 14.3 4.3l1.7-1.8', 'M20 20v-4.5h-4.5'],
  importer: ['M12 15V4', 'M8 8l4-4 4 4', 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3'],
  soleil: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M12 2.5v2',
    'M12 19.5v2',
    'M4.6 4.6L6 6',
    'M18 18l1.4 1.4',
    'M2.5 12h2',
    'M19.5 12h2',
    'M4.6 19.4L6 18',
    'M18 6l1.4-1.4',
  ],
  lune: ['M20 14.2A8 8 0 0 1 9.8 4a8 8 0 1 0 10.2 10.2z'],
  auto: ['M4 5h16v11H4z', 'M9 20h6', 'M12 16v4'],
  motifs: ['M4 4h16v16H4z', 'M4 12l8-8', 'M4 20L20 4', 'M12 20l8-8'],
  alerte: ['M12 4.2L2.8 19.5h18.4z', 'M12 10v4.5', 'M12 17.2v.3'],
  bloquante: ['M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z', 'M12 7.8v5', 'M12 15.9v.3'],
  majeure: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.8v5', 'M12 15.9v.3'],
  mineure: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7.5V12l3 2'],
  total: ['M5 5h14', 'M5 12h14', 'M5 19h14'],
  valide: ['M5 12.5l4.5 4.5L19 7.5'],
  fermer: ['M6 6l12 12', 'M18 6L6 18'],
  chevron: ['M9.5 6l6 6-6 6'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  recherche: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  'tri-asc': ['M12 19V5', 'M6.5 10.5L12 5l5.5 5.5'],
  'tri-desc': ['M12 5v14', 'M6.5 13.5L12 19l5.5-5.5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.8v.3'],
}
</script>

<template>
  <svg
    :width="taille"
    :height="taille"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(trace, i) in TRACES[nom]" :key="i" :d="trace" />
  </svg>
</template>
