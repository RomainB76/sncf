/**
 * Couleurs des graphiques. ECharts dessine dans un canvas/SVG et a besoin de valeurs concrètes :
 * ce fichier duplique volontairement les jetons de src/styles/tokens.css.
 *
 * Criticité = couleurs de STATUT (vert / ambre / rouge, comme dans le classeur), mais pas celles
 * d'Excel : le vert #2ECC71 et le rouge #E74C3C d'origine sont indiscernables pour un daltonien
 * deutéranope (ΔE 4), alors qu'ils se touchent dès qu'une équipe n'a aucune « Majeure ».
 * Le trio ci-dessous passe les contrôles toutes-paires (daltonisme ≥ 9, vision normale ≥ 16)
 * dans les deux thèmes. En thème clair, l'ambre et le vert ont un contraste < 3:1 sur le fond :
 * c'est compensé par les étiquettes directes et par le tableau toujours affiché à côté.
 */
import type { Priorite } from '@/domain/types'

export type NomTheme = 'light' | 'dark'

export interface PaletteGraphique {
  surface: string
  textePrincipal: string
  texteSecondaire: string
  texteAttenue: string
  grille: string
  bandeSurvol: string
  severite: Record<Priorite, string>
  /** Teinte « soulevée » du segment survolé. */
  severiteSurvol: Record<Priorite, string>
  /** Encre des motifs d'accessibilité (ton sur ton, plus sombre que le remplissage). */
  encreMotif: string
}

function melanger(hex: string, avec: string, part: number): string {
  const lire = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = lire(hex)
  const b = lire(avec)
  const canaux = a.map((canal, i) => Math.round(canal + ((b[i] ?? canal) - canal) * part))
  return `#${canaux.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function palette(
  base: Omit<PaletteGraphique, 'severiteSurvol'>,
  versBlanc: number,
): PaletteGraphique {
  return {
    ...base,
    severiteSurvol: {
      Mineure: melanger(base.severite.Mineure, '#ffffff', versBlanc),
      Majeure: melanger(base.severite.Majeure, '#ffffff', versBlanc),
      Bloquante: melanger(base.severite.Bloquante, '#ffffff', versBlanc),
    },
  }
}

export const PALETTES: Record<NomTheme, PaletteGraphique> = {
  light: palette(
    {
      surface: '#fcfcfb',
      textePrincipal: '#0b0b0b',
      texteSecondaire: '#52514e',
      texteAttenue: '#6f6d68',
      grille: '#e1e0d9',
      bandeSurvol: 'rgba(11, 11, 11, 0.05)',
      severite: { Mineure: '#1baf7a', Majeure: '#eda100', Bloquante: '#d03b3b' },
      encreMotif: 'rgba(11, 11, 11, 0.38)',
    },
    0.18,
  ),
  dark: palette(
    {
      surface: '#1a1a19',
      textePrincipal: '#ffffff',
      texteSecondaire: '#c3c2b7',
      texteAttenue: '#a09e96',
      grille: '#2c2c2a',
      bandeSurvol: 'rgba(255, 255, 255, 0.06)',
      severite: { Mineure: '#1baf7a', Majeure: '#c98500', Bloquante: '#d03b3b' },
      encreMotif: 'rgba(0, 0, 0, 0.45)',
    },
    0.16,
  ),
}

export const POLICE_GRAPHIQUE =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
