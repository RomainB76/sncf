<script setup lang="ts">
/**
 * Tableau « catégorie × criticité » : l'équivalent exact des tableaux du classeur
 * (Synthèse par Équipe, et Machine × criticité de chaque feuille équipe).
 *
 * Il double chaque graphique : toutes les valeurs y sont lisibles sans survol, au clavier
 * et par un lecteur d'écran. Une barre discrète dans chaque cellule situe la valeur par
 * rapport au maximum de sa colonne.
 */
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink, useRouter } from 'vue-router'
import Icone from '@/components/Icone.vue'
import { entier, LIBELLES_PRIORITE } from '@/domain/libelles'
import { PRIORITES, type LigneSynthese, type Repartition } from '@/domain/types'

const props = withDefaults(
  defineProps<{
    /** Intitulé de la première colonne : « Équipe » ou « Machine ». */
    premiereColonne: string
    lignes: readonly LigneSynthese[]
    total: Repartition
    /** « Total Général » sur le tableau de bord, « Total » sur une page équipe. */
    libelleTotal: string
    legende: string
    /** Destination d'une ligne (tableau de bord → page de l'équipe). */
    lienVers?: (cle: string) => RouteLocationRaw | undefined
    /** Ligne mise en avant (machine sélectionnée sur une page équipe). */
    cleActive?: string | null
    selectionnable?: boolean
  }>(),
  { lienVers: undefined, cleActive: null, selectionnable: false },
)

const emit = defineEmits<{ selection: [cle: string] }>()
const router = useRouter()

const COLONNES = [...PRIORITES, 'total'] as const
type Colonne = (typeof COLONNES)[number]

const maxima = computed(() => {
  const resultat: Record<Colonne, number> = { Mineure: 0, Majeure: 0, Bloquante: 0, total: 0 }
  for (const ligne of props.lignes) {
    for (const colonne of COLONNES) resultat[colonne] = Math.max(resultat[colonne], ligne[colonne])
  }
  return resultat
})

function largeur(valeur: number, colonne: Colonne): string {
  const max = maxima.value[colonne]
  return max > 0 ? `${(valeur / max) * 100}%` : '0%'
}

function classeDeColonne(colonne: Colonne): string {
  return colonne === 'total' ? 'neutre' : LIBELLES_PRIORITE[colonne].classe
}

const interactif = computed(() => props.lienVers !== undefined || props.selectionnable)

function activer(cle: string): void {
  const destination = props.lienVers?.(cle)
  if (destination) void router.push(destination)
  else if (props.selectionnable) emit('selection', cle)
}
</script>

<template>
  <div class="synthese">
    <table class="synthese__table">
      <caption class="visuellement-masque">
        {{ legende }}
      </caption>
      <thead>
        <tr>
          <th scope="col" class="synthese__categorie">{{ premiereColonne }}</th>
          <th v-for="priorite in PRIORITES" :key="priorite" scope="col" class="synthese__nombre">
            <span class="synthese__entete">
              <span class="pastille" :class="`pastille--${LIBELLES_PRIORITE[priorite].classe}`" />
              {{ priorite }}
            </span>
            <span class="synthese__seuil">{{ LIBELLES_PRIORITE[priorite].seuil }}</span>
          </th>
          <th scope="col" class="synthese__nombre">
            <span class="synthese__entete">Total</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="ligne in lignes"
          :key="ligne.cle"
          :class="{
            'synthese__ligne--interactive': interactif,
            'synthese__ligne--active': cleActive === ligne.cle,
          }"
          @click="interactif && activer(ligne.cle)"
        >
          <th scope="row" class="synthese__categorie">
            <RouterLink
              v-if="lienVers?.(ligne.cle)"
              :to="lienVers(ligne.cle)!"
              class="synthese__lien"
              @click.stop
            >
              {{ ligne.libelle }}
              <Icone nom="chevron" :taille="14" />
            </RouterLink>
            <button
              v-else-if="selectionnable"
              type="button"
              class="synthese__lien synthese__lien--bouton"
              :aria-pressed="cleActive === ligne.cle"
              @click.stop="activer(ligne.cle)"
            >
              {{ ligne.libelle }}
            </button>
            <template v-else>{{ ligne.libelle }}</template>
          </th>
          <td v-for="colonne in COLONNES" :key="colonne" class="synthese__nombre">
            <span
              class="synthese__barre"
              :class="`synthese__barre--${classeDeColonne(colonne)}`"
              :style="{ width: largeur(ligne[colonne], colonne) }"
              aria-hidden="true"
            />
            <span class="synthese__valeur" :class="{ 'synthese__valeur--nulle': ligne[colonne] === 0 }">
              {{ entier(ligne[colonne]) }}
            </span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" class="synthese__categorie">{{ libelleTotal }}</th>
          <td v-for="colonne in COLONNES" :key="colonne" class="synthese__nombre">
            <span class="synthese__valeur">{{ entier(total[colonne]) }}</span>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.synthese {
  overflow-x: auto;
}

.synthese__table {
  width: 100%;
  font-size: 13.5px;
}

th,
td {
  padding: 0 12px;
  height: 40px;
  border-bottom: 1px solid var(--gridline);
  text-align: left;
  font-weight: 400;
  white-space: nowrap;
}

thead th {
  height: 46px;
  padding-bottom: 6px;
  vertical-align: bottom;
  color: var(--text-secondary);
  font-size: 12.5px;
  border-bottom-color: var(--baseline);
}

.synthese__categorie {
  padding-left: 4px;
  color: var(--text-primary);
  font-weight: 550;
}

thead .synthese__categorie {
  color: var(--text-secondary);
  font-weight: 400;
}

.synthese__nombre {
  position: relative;
  width: 17%;
  min-width: 76px;
  padding-left: 8px;
  text-align: right;
}

.synthese__entete {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
  font-weight: 600;
}

.synthese__seuil {
  display: block;
  color: var(--text-muted);
  font-size: 11.5px;
}

/* Barre de fond : situe la valeur dans sa colonne, sans jamais remplacer le chiffre. */
.synthese__barre {
  position: absolute;
  top: 7px;
  bottom: 7px;
  right: 6px;
  max-width: calc(100% - 12px);
  border-radius: 4px 0 0 4px;
  background: var(--sev-neutre);
  opacity: 0.2;
  transition: width 0.4s ease-out;
}

.synthese__barre--mineure {
  background: var(--sev-mineure);
}

.synthese__barre--majeure {
  background: var(--sev-majeure);
}

.synthese__barre--bloquante {
  background: var(--sev-bloquante);
}

.synthese__valeur {
  position: relative;
  font-variant-numeric: tabular-nums;
  font-weight: 550;
  color: var(--text-primary);
}

.synthese__valeur--nulle {
  font-weight: 400;
  color: var(--text-muted);
}

.synthese__ligne--interactive {
  cursor: pointer;
}

.synthese__ligne--interactive:hover th,
.synthese__ligne--interactive:hover td {
  background: var(--surface-2);
}

.synthese__ligne--active th,
.synthese__ligne--active td,
.synthese__ligne--active:hover th,
.synthese__ligne--active:hover td {
  background: var(--accent-wash);
}

.synthese__lien {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  font: inherit;
  text-decoration: none;
}

.synthese__lien svg {
  opacity: 0;
  color: var(--text-muted);
  transition: opacity 0.15s;
}

tr:hover .synthese__lien svg,
.synthese__lien:focus-visible svg {
  opacity: 1;
}

.synthese__lien--bouton {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
}

tfoot th,
tfoot td {
  height: 44px;
  border-bottom: 0;
  border-top: 1px solid var(--baseline);
  font-weight: 650;
}

tfoot .synthese__valeur {
  font-weight: 700;
}
</style>
