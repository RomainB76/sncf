<script setup lang="ts">
/**
 * Histogramme horizontal « criticité par catégorie » (équipes ou machines).
 *
 * Reprend les graphiques du classeur — barres horizontales, séries Mineure / Majeure / Bloquante —
 * avec deux lectures :
 *  - « empilé » (par défaut) : une barre par catégorie, total en bout de barre. On compare les
 *    volumes ET on lit la part de chaque criticité ;
 *  - « groupé » : la vue d'origine d'Excel, trois barres côte à côte avec leur valeur.
 *
 * Aucune valeur n'est réservée à l'infobulle : tout figure aussi dans le tableau voisin.
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
import { entier, LIBELLES_PRIORITE, part } from '@/domain/libelles'
import { PRIORITES, type LigneSynthese, type Priorite } from '@/domain/types'
import { PALETTES, POLICE_GRAPHIQUE } from '@/theme/palette'

use([BarChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer])

type OptionGraphique = ComposeOption<
  BarSeriesOption | GridComponentOption | TooltipComponentOption | AriaComponentOption
>

export type ModeGraphique = 'empile' | 'groupe'

const props = withDefaults(
  defineProps<{
    lignes: readonly LigneSynthese[]
    mode: ModeGraphique
    visibles: Record<Priorite, boolean>
    /** Description lue par les lecteurs d'écran. */
    description: string
    /** Si renseigné, les bandes sont cliquables et ce texte l'annonce dans l'infobulle. */
    aideClic?: string
    messageVide?: string
  }>(),
  { aideClic: undefined, messageVide: 'Aucune anomalie à afficher.' },
)

const emit = defineEmits<{ selection: [cle: string] }>()

const { themeEffectif } = useTheme()
const { motifs, mouvementReduit, ecranEtroit } = usePreferences()

const graphique = ref<InstanceType<typeof VChart>>()
const surUneBande = ref(false)

const EPAISSEUR_EMPILE = 20
const EPAISSEUR_GROUPE = 11
const MISE_A_JOUR = { replaceMerge: ['series'] }

const prioritesVisibles = computed(() => PRIORITES.filter((p) => props.visibles[p]))

function sommeVisible(ligne: LigneSynthese): number {
  return prioritesVisibles.value.reduce((somme, p) => somme + ligne[p], 0)
}

const estVide = computed(() => props.lignes.every((l) => l.total === 0))

/** La hauteur suit le nombre de catégories : les barres gardent une épaisseur constante. */
const hauteur = computed(() => {
  const n = Math.max(props.lignes.length, 1)
  const bande =
    props.mode === 'empile' ? 40 : Math.max(prioritesVisibles.value.length, 1) * (EPAISSEUR_GROUPE + 4) + 20
  return n * bande + 34
})

const option = computed<OptionGraphique>(() => {
  const p = PALETTES[themeEffectif.value]
  const empile = props.mode === 'empile'

  // Hachures à 45° (Majeure) et 135° (Bloquante) : jamais horizontales ni verticales, qui se
  // confondraient avec la grille ou les barres. Dès que les motifs sont actifs, ECharts en attribue
  // un par défaut à TOUTE série qui n'en décrit pas : « Mineure » (unie) et la série des totaux
  // (invisible) reçoivent donc un motif complet mais transparent. La forme abrégée 'none' est à
  // proscrire : elle fait planter le rendu d'ECharts 6.
  const motifDe = (priorite: Priorite | 'total') => {
    if (!motifs.value) return undefined
    const visible = priorite === 'Majeure' || priorite === 'Bloquante'
    return {
      symbol: 'rect' as const,
      symbolSize: 1,
      color: visible ? p.encreMotif : 'rgba(0, 0, 0, 0)',
      dashArrayX: [1, 0],
      dashArrayY: priorite === 'Bloquante' ? [2, 3] : [2, 5],
      rotation: priorite === 'Bloquante' ? -Math.PI / 4 : Math.PI / 4,
    }
  }

  const series: BarSeriesOption[] = prioritesVisibles.value.map((priorite, rang) => ({
    id: priorite,
    name: priorite,
    type: 'bar',
    stack: empile ? 'criticite' : undefined,
    barWidth: empile ? EPAISSEUR_EMPILE : EPAISSEUR_GROUPE,
    barGap: '30%',
    cursor: props.aideClic ? 'pointer' : 'default',
    itemStyle: {
      color: p.severite[priorite],
      // Interstice de 2 px dans la couleur du fond entre segments empilés (1 px par segment).
      borderColor: p.surface,
      borderWidth: empile ? 1 : 0,
      decal: motifDe(priorite),
    },
    emphasis: { focus: 'none', itemStyle: { color: p.severiteSurvol[priorite] } },
    label: {
      show: !empile,
      position: 'right',
      distance: 6,
      color: p.texteSecondaire,
      fontFamily: POLICE_GRAPHIQUE,
      fontSize: 11,
      formatter: (d) => (typeof d.value === 'number' && d.value > 0 ? entier(d.value) : ''),
    },
    data: props.lignes.map((ligne) => {
      const valeur = ligne[priorite]
      // Extrémité arrondie côté donnée, carrée côté axe ; en empilé, seul le dernier segment l'est.
      const estLeBout =
        !empile || prioritesVisibles.value.slice(rang + 1).every((suivante) => ligne[suivante] === 0)
      return {
        value: empile && valeur === 0 ? null : valeur,
        itemStyle: { borderRadius: estLeBout ? [0, 4, 4, 0] : 0 },
      }
    }),
  }))

  if (empile) {
    // Série transparente superposée : elle ne sert qu'à poser le total au bout de chaque barre.
    series.push({
      id: 'total',
      name: 'Total',
      type: 'bar',
      barWidth: EPAISSEUR_EMPILE,
      barGap: '-100%',
      silent: true,
      itemStyle: { color: 'transparent', decal: motifDe('total') },
      emphasis: { disabled: true },
      tooltip: { show: false },
      label: {
        show: true,
        position: 'right',
        distance: 8,
        color: p.textePrincipal,
        fontFamily: POLICE_GRAPHIQUE,
        fontSize: 12,
        fontWeight: 600,
        formatter: (d) => (typeof d.value === 'number' ? entier(d.value) : ''),
      },
      data: props.lignes.map(sommeVisible),
    })
  }

  return {
    animation: !mouvementReduit.value,
    animationDuration: 450,
    animationDurationUpdate: 320,
    animationEasing: 'cubicOut',
    textStyle: { fontFamily: POLICE_GRAPHIQUE },
    aria: {
      enabled: true,
      label: { enabled: true, description: props.description },
      decal: { show: motifs.value },
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
      axisLabel: { color: p.texteAttenue, fontFamily: POLICE_GRAPHIQUE, fontSize: 11 },
      splitLine: { lineStyle: { color: p.grille, width: 1, type: 'solid' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: props.lignes.map((l) => l.libelle),
      axisLine: { show: true, lineStyle: { color: p.grille } },
      axisTick: { show: false },
      axisLabel: {
        color: p.texteSecondaire,
        fontFamily: POLICE_GRAPHIQUE,
        fontSize: ecranEtroit.value ? 11.5 : 12.5,
        margin: ecranEtroit.value ? 8 : 12,
        // Sur téléphone, les libellés cèdent de la place au tracé (le nom complet reste dans
        // l'infobulle et dans le tableau).
        width: ecranEtroit.value ? 92 : 132,
        overflow: 'truncate',
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: p.bandeSurvol } },
      // Le contenu est rendu par Vue (slot) juste APRÈS qu'ECharts a mesuré l'infobulle : sa taille
      // est donc inconnue au premier affichage et `confine` ne suffit pas. On place l'infobulle
      // nous-mêmes, à droite du pointeur, ou à gauche s'il n'y a pas la place.
      position: (point, _params, _dom, _rect, taille) => {
        const [largeurVue, hauteurVue] = taille.viewSize
        const largeur = Math.max(taille.contentSize[0], 236)
        const hauteur = Math.max(taille.contentSize[1], props.aideClic ? 196 : 168)
        const borner = (v: number, max: number) => Math.max(4, Math.min(v, max))
        const aDroite = point[0] + 18
        const x = aDroite + largeur <= largeurVue ? aDroite : point[0] - largeur - 18
        return [borner(x, largeurVue - largeur - 4), borner(point[1] - hauteur / 2, hauteurVue - hauteur - 4)]
      },
      padding: 0,
      borderWidth: 1,
      borderColor: p.grille,
      backgroundColor: p.surface,
      transitionDuration: 0.12,
      extraCssText: 'border-radius:12px;box-shadow:var(--shadow-pop);',
    },
    series,
  }
})

// La hauteur change en même temps que les options (criticité masquée en mode groupé, nombre de
// catégories) : l'observateur de taille de vue-echarts arrive alors un cran trop tard. On
// redimensionne donc explicitement, une fois le DOM à jour.
watch(
  hauteur,
  () => {
    // Au changement de mode l'instance vient d'être recréée : elle prend d'office la bonne taille.
    const instance = graphique.value
    if (instance?.chart && !instance.chart.isDisposed()) instance.resize()
  },
  { flush: 'post' },
)

function ligneDesParametres(parametres: unknown): LigneSynthese | undefined {
  const premier: unknown = Array.isArray(parametres) ? parametres[0] : parametres
  const index = (premier as { dataIndex?: unknown } | null | undefined)?.dataIndex
  return typeof index === 'number' ? props.lignes[index] : undefined
}

function ligneSousLePointeur(evenement: { offsetX: number; offsetY: number }): LigneSynthese | undefined {
  const instance = graphique.value
  if (!instance) return undefined
  const point = [evenement.offsetX, evenement.offsetY]
  if (!instance.containPixel({ gridIndex: 0 }, point)) return undefined
  const coordonnees = instance.convertFromPixel({ gridIndex: 0 }, point) as unknown
  const index = Array.isArray(coordonnees) ? Number(coordonnees[1]) : Number.NaN
  return Number.isInteger(index) ? props.lignes[index] : undefined
}

function surSurvol(evenement: { offsetX: number; offsetY: number }): void {
  surUneBande.value = props.aideClic !== undefined && ligneSousLePointeur(evenement) !== undefined
}

function surClic(evenement: { offsetX: number; offsetY: number }): void {
  if (props.aideClic === undefined) return
  const ligne = ligneSousLePointeur(evenement)
  if (ligne) emit('selection', ligne.cle)
}
</script>

<template>
  <div
    class="graphique"
    :class="{ 'graphique--pointeur': surUneBande }"
    :style="{ height: `${hauteur}px` }"
  >
    <!--
      L'instance est recréée (:key) dès que la STRUCTURE change : mode empilé/groupé, ou ensemble
      des criticités affichées. L'ordre des séries — donc l'ordre d'empilement Mineure → Majeure →
      Bloquante et la position des totaux — reste ainsi toujours le même. À structure constante
      (tri, nouvelles données), les séries sont fusionnées par identifiant et s'animent en douceur.
    -->
    <VChart
      :key="`${mode}|${prioritesVisibles.join('+')}|${motifs ? 'motifs' : 'uni'}`"
      ref="graphique"
      class="graphique__trace"
      :option="option"
      :update-options="MISE_A_JOUR"
      :init-options="{ renderer: 'svg' }"
      autoresize
      @zr:click="surClic"
      @zr:mousemove="surSurvol"
      @zr:globalout="surUneBande = false"
    >
      <template #tooltip="parametres">
        <div v-if="ligneDesParametres(parametres)" class="infobulle">
          <div class="infobulle__titre">{{ ligneDesParametres(parametres)!.libelle }}</div>
          <div v-for="priorite in PRIORITES" :key="priorite" class="infobulle__ligne">
            <span
              class="infobulle__cle"
              :style="{ background: `var(--sev-${LIBELLES_PRIORITE[priorite].classe})` }"
            />
            <span class="infobulle__nom">{{ priorite }}</span>
            <span class="infobulle__valeur">{{ entier(ligneDesParametres(parametres)![priorite]) }}</span>
            <span class="infobulle__part">
              {{ part(ligneDesParametres(parametres)![priorite], ligneDesParametres(parametres)!.total) }}
            </span>
          </div>
          <div class="infobulle__total">
            <span>Total</span>
            <strong>{{ entier(ligneDesParametres(parametres)!.total) }}</strong>
          </div>
          <div v-if="aideClic" class="infobulle__aide">{{ aideClic }}</div>
        </div>
      </template>
    </VChart>

    <p v-if="estVide" class="graphique__vide">{{ messageVide }}</p>
  </div>
</template>

<style scoped>
.graphique {
  position: relative;
  width: 100%;
  min-width: 0;
}

.graphique__trace {
  width: 100%;
  height: 100%;
}

.graphique--pointeur {
  cursor: pointer;
}

.graphique__vide {
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
