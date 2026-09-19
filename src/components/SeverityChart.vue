<script setup lang="ts">
/**
 * Horizontal bar chart « severity by category » (teams or machines).
 *
 * Reproduces the workbook charts — horizontal bars, Mineure / Majeure / Bloquante series —
 * with two readings:
 *  - « stacked » (default): one bar per category, total at the end of the bar. Volumes are
 *    compared AND the share of each severity is readable;
 *  - « grouped »: the original Excel view, three bars side by side with their value.
 *
 * No value is reserved to the tooltip: everything is also in the neighbouring table.
 */
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use, type ComposeOption } from 'echarts/core'
import { BarChart, type BarSeriesOption } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
  type AriaComponentOption,
  type GridComponentOption,
  type TooltipComponentOption,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { usePreferences } from '@/composables/usePreferences'
import { useTheme } from '@/composables/useTheme'
import { formatInteger, formatShare, PRIORITY_LABELS } from '@/domain/labels'
import { PRIORITIES, type Priority, type SummaryRow } from '@/domain/types'
import { CHART_FONT, PALETTES } from '@/theme/palette'

use([BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer])

type ChartOption = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption
>

export type ChartMode = 'stacked' | 'grouped'

const props = withDefaults(
  defineProps<{
    rows: readonly SummaryRow[]
    mode: ChartMode
    visible: Record<Priority, boolean>
    /** Description read by screen readers. */
    description: string
    /** When set, the bands are clickable and this text announces it in the tooltip. */
    clickHint?: string
    emptyMessage?: string
  }>(),
  { clickHint: undefined, emptyMessage: 'Aucune anomalie à afficher.' },
)

const emit = defineEmits<{ select: [key: string] }>()

const { effectiveTheme } = useTheme()
const { patterns, reducedMotion, narrowScreen } = usePreferences()

const chart = ref<InstanceType<typeof VChart>>()
const onBand = ref(false)

const STACKED_THICKNESS = 20
const GROUPED_THICKNESS = 11
const UPDATE_OPTIONS = { replaceMerge: ['series'] }

const visiblePriorities = computed(() => PRIORITIES.filter((p) => props.visible[p]))

function visibleSum(row: SummaryRow): number {
  return visiblePriorities.value.reduce((sum, p) => sum + row[p], 0)
}

const isEmpty = computed(() => props.rows.every((row) => row.total === 0))

/** The height follows the number of categories: the bars keep a constant thickness. */
const height = computed(() => {
  const n = Math.max(props.rows.length, 1)
  const band =
    props.mode === 'stacked' ? 40 : Math.max(visiblePriorities.value.length, 1) * (GROUPED_THICKNESS + 4) + 20
  return n * band + 34
})

const option = computed<ChartOption>(() => {
  const p = PALETTES[effectiveTheme.value]
  const stacked = props.mode === 'stacked'

  // Hatching at 45° (Major) and 135° (Blocking): never horizontal nor vertical, which would be
  // confused with the grid or the bars. As soon as patterns are on, ECharts assigns a default
  // one to EVERY series that does not describe its own: « Mineure » (plain) and the totals series
  // (invisible) therefore get a complete but transparent pattern. The shorthand 'none' must be
  // avoided: it crashes the ECharts 6 rendering.
  const patternFor = (priority: Priority | 'total') => {
    if (!patterns.value) return undefined
    const visible = priority === 'major' || priority === 'blocking'
    return {
      symbol: 'rect' as const,
      symbolSize: 1,
      color: visible ? p.patternInk : 'rgba(0, 0, 0, 0)',
      dashArrayX: [1, 0],
      dashArrayY: priority === 'blocking' ? [2, 3] : [2, 5],
      rotation: priority === 'blocking' ? -Math.PI / 4 : Math.PI / 4,
    }
  }

  const series: BarSeriesOption[] = visiblePriorities.value.map((priority, rank) => ({
    id: priority,
    name: PRIORITY_LABELS[priority].name,
    type: 'bar',
    stack: stacked ? 'severity' : undefined,
    barWidth: stacked ? STACKED_THICKNESS : GROUPED_THICKNESS,
    barGap: '30%',
    cursor: props.clickHint ? 'pointer' : 'default',
    itemStyle: {
      color: p.severity[priority],
      // 2 px gap in the background colour between stacked segments (1 px per segment).
      borderColor: p.surface,
      borderWidth: stacked ? 1 : 0,
      decal: patternFor(priority),
    },
    emphasis: { focus: 'none', itemStyle: { color: p.severityHover[priority] } },
    label: {
      show: !stacked,
      position: 'right',
      distance: 6,
      color: p.textSecondary,
      fontFamily: CHART_FONT,
      fontSize: 11,
      formatter: (d) => (typeof d.value === 'number' && d.value > 0 ? formatInteger(d.value) : ''),
    },
    data: props.rows.map((row) => {
      const value = row[priority]
      // Rounded end on the data side, square on the axis side; when stacked, only the last segment is.
      const isTheEnd =
        !stacked || visiblePriorities.value.slice(rank + 1).every((next) => row[next] === 0)
      return {
        value: stacked && value === 0 ? null : value,
        itemStyle: { borderRadius: isTheEnd ? [0, 4, 4, 0] : 0 },
      }
    }),
  }))

  if (stacked) {
    // Transparent overlaid series: it only serves to place the total at the end of each bar.
    series.push({
      id: 'total',
      name: 'Total',
      type: 'bar',
      barWidth: STACKED_THICKNESS,
      barGap: '-100%',
      silent: true,
      itemStyle: { color: 'transparent', decal: patternFor('total') },
      emphasis: { disabled: true },
      tooltip: { show: false },
      label: {
        show: true,
        position: 'right',
        distance: 8,
        color: p.textPrimary,
        fontFamily: CHART_FONT,
        fontSize: 12,
        fontWeight: 600,
        formatter: (d) => (typeof d.value === 'number' ? formatInteger(d.value) : ''),
      },
      data: props.rows.map(visibleSum),
    })
  }

  return {
    animation: !reducedMotion.value,
    animationDuration: 450,
    animationDurationUpdate: 320,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: CHART_FONT },
    aria: {
      enabled: true,
      label: { enabled: true, description: props.description },
      decal: { show: patterns.value },
    },
    grid: {
      left: 2,
      right: 46,
      top: 4,
      bottom: 2,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.textMuted, fontFamily: CHART_FONT, fontSize: 11 },
      splitLine: { lineStyle: { color: p.gridline, width: 1, type: 'solid' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: props.rows.map((row) => row.label),
      axisLine: { show: true, lineStyle: { color: p.gridline } },
      axisTick: { show: false },
      axisLabel: {
        color: p.textSecondary,
        fontFamily: CHART_FONT,
        fontSize: narrowScreen.value ? 11.5 : 12.5,
        margin: narrowScreen.value ? 8 : 12,
        // On a phone, labels give way to the plot (the full name stays in the tooltip and
        // in the table).
        width: narrowScreen.value ? 92 : 132,
        overflow: 'truncate',
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: p.hoverBand } },
      // The content is rendered by Vue (slot) right AFTER ECharts measured the tooltip: its size
      // is therefore unknown on first display and `confine` is not enough. The tooltip is placed
      // by hand, to the right of the pointer, or to the left when there is no room.
      position: (point, _params, _dom, _rect, size) => {
        const [viewWidth, viewHeight] = size.viewSize
        const width = Math.max(size.contentSize[0], 236)
        const tooltipHeight = Math.max(size.contentSize[1], props.clickHint ? 196 : 168)
        const clamp = (v: number, max: number) => Math.max(4, Math.min(v, max))
        const right = point[0] + 18
        const x = right + width <= viewWidth ? right : point[0] - width - 18
        return [clamp(x, viewWidth - width - 4), clamp(point[1] - tooltipHeight / 2, viewHeight - tooltipHeight - 4)]
      },
      padding: 0,
      borderWidth: 1,
      borderColor: p.gridline,
      backgroundColor: p.surface,
      transitionDuration: 0.12,
      extraCssText: 'border-radius:12px;box-shadow:var(--shadow-pop);',
    },
    series,
  }
})

// The height changes at the same time as the options (severity hidden in grouped mode, number
// of categories): the size observer of vue-echarts then arrives one step too late. So the chart
// is resized explicitly, once the DOM is up to date.
watch(
  height,
  () => {
    // On a mode change the instance was just recreated: it takes the right size by itself.
    const instance = chart.value
    if (instance?.chart && !instance.chart.isDisposed()) instance.resize()
  },
  { flush: 'post' },
)

function rowFromParams(params: unknown): SummaryRow | undefined {
  const first: unknown = Array.isArray(params) ? params[0] : params
  const index = (first as { dataIndex?: unknown } | null | undefined)?.dataIndex
  return typeof index === 'number' ? props.rows[index] : undefined
}

function rowUnderPointer(event: { offsetX: number; offsetY: number }): SummaryRow | undefined {
  const instance = chart.value
  if (!instance) return undefined
  const point = [event.offsetX, event.offsetY]
  if (!instance.containPixel({ gridIndex: 0 }, point)) return undefined
  const coordinates = instance.convertFromPixel({ gridIndex: 0 }, point) as unknown
  const index = Array.isArray(coordinates) ? Number(coordinates[1]) : Number.NaN
  return Number.isInteger(index) ? props.rows[index] : undefined
}

function onHover(event: { offsetX: number; offsetY: number }): void {
  onBand.value = props.clickHint !== undefined && rowUnderPointer(event) !== undefined
}

function onClick(event: { offsetX: number; offsetY: number }): void {
  if (props.clickHint === undefined) return
  const row = rowUnderPointer(event)
  if (row) emit('select', row.key)
}
</script>

<template>
  <div
    class="chart"
    :class="{ 'chart--pointer': onBand }"
    :style="{ height: `${height}px` }"
  >
    <!--
      The instance is recreated (:key) as soon as the STRUCTURE changes: stacked/grouped mode, or
      set of displayed severities. The order of the series — hence the stacking order Mineure →
      Majeure → Bloquante and the position of the totals — thus always stays the same. With a
      constant structure (sorting, new data), the series are merged by id and animate smoothly.
    -->
    <VChart
      :key="`${mode}|${visiblePriorities.join('+')}|${patterns ? 'patterns' : 'plain'}`"
      ref="chart"
      class="chart__canvas"
      :option="option"
      :update-options="UPDATE_OPTIONS"
      :init-options="{ renderer: 'svg' }"
      autoresize
      @zr:click="onClick"
      @zr:mousemove="onHover"
      @zr:globalout="onBand = false"
    >
      <template #tooltip="params">
        <div v-if="rowFromParams(params)" class="tooltip">
          <div class="tooltip__title">{{ rowFromParams(params)!.label }}</div>
          <div v-for="priority in PRIORITIES" :key="priority" class="tooltip__row">
            <span class="tooltip__swatch" :style="{ background: `var(--sev-${priority})` }" />
            <span class="tooltip__name">{{ PRIORITY_LABELS[priority].name }}</span>
            <span class="tooltip__value">{{ formatInteger(rowFromParams(params)![priority]) }}</span>
            <span class="tooltip__share">
              {{ formatShare(rowFromParams(params)![priority], rowFromParams(params)!.total) }}
            </span>
          </div>
          <div class="tooltip__total">
            <span>Total</span>
            <strong>{{ formatInteger(rowFromParams(params)!.total) }}</strong>
          </div>
          <div v-if="clickHint" class="tooltip__hint">{{ clickHint }}</div>
        </div>
      </template>
    </VChart>

    <p v-if="isEmpty" class="chart__empty">{{ emptyMessage }}</p>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
  min-width: 0;
}

.chart__canvas {
  width: 100%;
  height: 100%;
}

.chart--pointer {
  cursor: pointer;
}

.chart__empty {
  position: absolute;
  inset: 0 46px 24px 110px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
}
</style>
