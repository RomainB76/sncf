/**
 * Chart colours. ECharts draws in a canvas/SVG and needs concrete values: this file deliberately
 * duplicates the tokens of src/styles/tokens.css.
 *
 * Severity = STATUS colours (green / amber / red, as in the workbook), but not the Excel ones:
 * the original green #2ECC71 and red #E74C3C are indistinguishable for a deuteranope
 * colour-blind person (ΔE 4), while they touch as soon as a team has no « Majeure ».
 * The trio below passes the all-pairs checks (colour blindness ≥ 9, normal vision ≥ 16)
 * in both themes. In the light theme, amber and green have a contrast < 3:1 on the background:
 * this is compensated by the direct labels and by the table always displayed next to the chart.
 */
import type { Priority } from '@/domain/types'

export type ThemeName = 'light' | 'dark'

export interface ChartPalette {
  surface: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  gridline: string
  hoverBand: string
  severity: Record<Priority, string>
  /** « Lifted » tint of the hovered segment. */
  severityHover: Record<Priority, string>
  /** Ink of the accessibility patterns (tone on tone, darker than the fill). */
  patternInk: string
}

function mix(hex: string, withHex: string, share: number): string {
  const read = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = read(hex)
  const b = read(withHex)
  const channels = a.map((channel, i) => Math.round(channel + ((b[i] ?? channel) - channel) * share))
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

function buildPalette(
  base: Omit<ChartPalette, 'severityHover'>,
  towardsWhite: number,
): ChartPalette {
  return {
    ...base,
    severityHover: {
      minor: mix(base.severity.minor, '#ffffff', towardsWhite),
      major: mix(base.severity.major, '#ffffff', towardsWhite),
      blocking: mix(base.severity.blocking, '#ffffff', towardsWhite),
    },
  }
}

export const PALETTES: Record<ThemeName, ChartPalette> = {
  light: buildPalette(
    {
      surface: '#fcfcfb',
      textPrimary: '#0b0b0b',
      textSecondary: '#52514e',
      textMuted: '#6f6d68',
      gridline: '#e1e0d9',
      hoverBand: 'rgba(11, 11, 11, 0.05)',
      severity: { minor: '#1baf7a', major: '#eda100', blocking: '#d03b3b' },
      patternInk: 'rgba(11, 11, 11, 0.38)',
    },
    0.18,
  ),
  dark: buildPalette(
    {
      surface: '#1a1a19',
      textPrimary: '#ffffff',
      textSecondary: '#c3c2b7',
      textMuted: '#a09e96',
      gridline: '#2c2c2a',
      hoverBand: 'rgba(255, 255, 255, 0.06)',
      severity: { minor: '#1baf7a', major: '#c98500', blocking: '#d03b3b' },
      patternInk: 'rgba(0, 0, 0, 0.45)',
    },
    0.16,
  ),
}

export const CHART_FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
