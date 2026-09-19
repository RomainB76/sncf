<script setup lang="ts">
/**
 * Page d'une équipe — l'équivalent des feuilles AFFAIRES, CHAUDRO, … PIECES DEPOSEES :
 *  - tableau « Machine × criticité » et sa ligne « Total » ;
 *  - graphique « Gravité des Anomalies par Machine - Équipe X ».
 * Un seul composant sert toutes les équipes : une équipe nouvelle dans les données obtient sa page d'office.
 */
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { RouterLink } from 'vue-router'
import BandeauxDonnees from '@/components/BandeauxDonnees.vue'
import ControleSegmente from '@/components/ControleSegmente.vue'
import GraphiqueCriticite, { type ModeGraphique } from '@/components/GraphiqueCriticite.vue'
import LegendeCriticite from '@/components/LegendeCriticite.vue'
import TableauAnomalies from '@/components/TableauAnomalies.vue'
import TableauSynthese from '@/components/TableauSynthese.vue'
import TuileIndicateur from '@/components/TuileIndicateur.vue'
import { entier, LIBELLES_PRIORITE } from '@/domain/libelles'
import { repartitionVide } from '@/domain/indicateurs'
import type { Priorite } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

const props = defineProps<{ slug: string }>()

const store = useAnomaliesStore()

const mode = ref<ModeGraphique>('empile')
const visibles = ref<Record<Priorite, boolean>>({ Mineure: true, Majeure: true, Bloquante: true })
const machineFiltree = ref<string | null>(null)
const carteDetail = ref<HTMLElement>()

const MODES = [
  { valeur: 'empile', libelle: 'Empilé' },
  { valeur: 'groupe', libelle: 'Groupé' },
] as const

const equipe = computed(() => store.equipeParSlug(props.slug))
const analyse = computed(
  () =>
    (equipe.value && store.analysesParEquipe.get(equipe.value.cle)) ?? {
      lignes: [],
      total: repartitionVide(),
      horsTableau: 0,
    },
)
const anomalies = computed(() => (equipe.value ? store.anomaliesDeLEquipe(equipe.value.cle) : []))
const total = computed(() => analyse.value.total)

const description = computed(
  () =>
    `Histogramme horizontal des anomalies de l'équipe ${equipe.value?.libelle ?? ''} par machine, détaillées par criticité. ` +
    analyse.value.lignes.map((l) => `${l.libelle} : ${l.total} dont ${l.Bloquante} bloquantes`).join(' ; ') +
    '.',
)

const libelleMachineFiltree = computed(
  () => store.machines.find((m) => m.cle === machineFiltree.value)?.libelle ?? null,
)

/** Clic sur une machine (graphique ou tableau) : filtre le détail, un second clic retire le filtre. */
async function filtrerSurMachine(cle: string): Promise<void> {
  machineFiltree.value = machineFiltree.value === cle ? null : cle
  if (machineFiltree.value === null) return
  await nextTick()
  carteDetail.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(
  () => props.slug,
  () => {
    machineFiltree.value = null
  },
)

watchEffect(() => {
  document.title = `${equipe.value?.libelle ?? 'Équipe'} · Suivi des anomalies`
})
</script>

<template>
  <div v-if="equipe" class="page">
    <header class="page__entete">
      <p class="page__surtitre">Analyse équipe</p>
      <h1 class="page__titre">{{ equipe.libelle }}</h1>
    </header>

    <BandeauxDonnees />

    <section class="indicateurs" aria-label="Indicateurs de l'équipe">
      <TuileIndicateur libelle="Total équipe" precision="Anomalies priorisées" :valeur="total.total" />
      <TuileIndicateur
        v-for="priorite in (['Bloquante', 'Majeure', 'Mineure'] as const)"
        :key="priorite"
        :libelle="LIBELLES_PRIORITE[priorite].pluriel"
        :ton="LIBELLES_PRIORITE[priorite].classe"
        :precision="LIBELLES_PRIORITE[priorite].seuil"
        :valeur="total[priorite]"
        :total="total.total"
      />
    </section>

    <div class="page__grille">
      <section class="carte" aria-labelledby="titre-gravite">
        <div class="carte__entete">
          <div>
            <h2 id="titre-gravite" class="carte__titre">Gravité des anomalies par machine</h2>
            <p class="carte__sous-titre">Équipe {{ equipe.libelle }} · cliquer sur une machine pour filtrer le détail</p>
          </div>
          <ControleSegmente v-model="mode" :options="MODES" etiquette="Type d'histogramme" />
        </div>
        <div class="carte__corps">
          <LegendeCriticite v-model="visibles" class="carte__legende" />
          <GraphiqueCriticite
            :lignes="analyse.lignes"
            :mode="mode"
            :visibles="visibles"
            :description="description"
            aide-clic="Cliquer pour filtrer le détail sur cette machine"
            message-vide="Aucune anomalie priorisée pour cette équipe."
            @selection="filtrerSurMachine"
          />
        </div>
      </section>

      <section class="carte" aria-labelledby="titre-machines">
        <div class="carte__entete">
          <div>
            <h2 id="titre-machines" class="carte__titre">Synthèse par machine</h2>
            <p class="carte__sous-titre">Les mêmes chiffres, en tableau</p>
          </div>
        </div>
        <div class="carte__corps">
          <TableauSynthese
            premiere-colonne="Machine"
            libelle-total="Total"
            :legende="`Équipe ${equipe.libelle} : nombre d'anomalies par machine et par criticité`"
            :lignes="analyse.lignes"
            :total="analyse.total"
            :cle-active="machineFiltree"
            selectionnable
            @selection="filtrerSurMachine"
          />
          <p v-if="analyse.horsTableau > 0" class="note">
            {{ entier(analyse.horsTableau) }} anomalie{{ analyse.horsTableau > 1 ? 's' : '' }} de l'équipe sans rame
            renseignée : absente{{ analyse.horsTableau > 1 ? 's' : '' }} de ce tableau, visible{{ analyse.horsTableau > 1 ? 's' : '' }} dans le détail ci-dessous.
          </p>
        </div>
      </section>
    </div>

    <section ref="carteDetail" class="carte carte--detail" aria-labelledby="titre-detail">
      <div class="carte__entete">
        <div>
          <h2 id="titre-detail" class="carte__titre">Détail des anomalies</h2>
          <p class="carte__sous-titre">
            {{ entier(anomalies.length) }} ligne{{ anomalies.length > 1 ? 's' : '' }} pour l'équipe
            <template v-if="libelleMachineFiltree"> · filtrées sur la machine {{ libelleMachineFiltree }}</template>
          </p>
        </div>
      </div>
      <TableauAnomalies v-model:machine="machineFiltree" :anomalies="anomalies" :machines="store.machines" />
    </section>
  </div>

  <div v-else class="page introuvable">
    <h1 class="page__titre">Équipe introuvable</h1>
    <p class="page__sous-titre">Aucune équipe ne correspond à « {{ slug }} » dans les données chargées.</p>
    <RouterLink :to="{ name: 'tableau-de-bord' }" class="bouton">Retour au tableau de bord</RouterLink>
  </div>
</template>

<style scoped>
.indicateurs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 860px) {
  .indicateurs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.carte__legende {
  margin: 0 0 8px -9px;
}

.carte--detail {
  margin-top: 20px;
  scroll-margin-top: calc(var(--topbar-height) + 16px);
}

.carte--detail .carte__entete {
  padding-bottom: 14px;
}

.note {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.introuvable {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
</style>
