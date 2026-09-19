<script setup lang="ts">
/**
 * Page « Tableau de Bord » — feuille du même nom dans le classeur :
 *  - 5 indicateurs de tête (A4, C4, E4, G4, I4) ;
 *  - graphique « Répartition des Anomalies par Équipe » ;
 *  - tableau « Synthèse par Équipe » avec sa ligne « Total Général ».
 */
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import BandeauxDonnees from '@/components/BandeauxDonnees.vue'
import BarreRepartition from '@/components/BarreRepartition.vue'
import ControleSegmente from '@/components/ControleSegmente.vue'
import GraphiqueCriticite, { type ModeGraphique } from '@/components/GraphiqueCriticite.vue'
import LegendeCriticite from '@/components/LegendeCriticite.vue'
import TableauSynthese from '@/components/TableauSynthese.vue'
import TuileIndicateur from '@/components/TuileIndicateur.vue'
import { entier, LIBELLES_PRIORITE } from '@/domain/libelles'
import { PRIORITES, type LigneSynthese, type Priorite } from '@/domain/types'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const router = useRouter()

const mode = ref<ModeGraphique>('empile')
const tri = ref<'classeur' | 'volume'>('classeur')
const visibles = ref<Record<Priorite, boolean>>({ Mineure: true, Majeure: true, Bloquante: true })

const MODES = [
  { valeur: 'empile', libelle: 'Empilé' },
  { valeur: 'groupe', libelle: 'Groupé' },
] as const
const TRIS = [
  { valeur: 'classeur', libelle: 'Ordre du classeur' },
  { valeur: 'volume', libelle: 'Volume décroissant' },
] as const

const indicateurs = computed(() => store.indicateurs)

/** Le tri « volume » porte sur les criticités affichées : masquer Mineure et Majeure classe les équipes par bloquantes. */
const lignesDuGraphique = computed<LigneSynthese[]>(() => {
  const lignes = [...store.synthese.lignes]
  if (tri.value === 'volume') {
    const volume = (l: LigneSynthese) => PRIORITES.reduce((s, p) => s + (visibles.value[p] ? l[p] : 0), 0)
    lignes.sort((a, b) => volume(b) - volume(a))
  }
  return lignes
})

const description = computed(
  () =>
    'Histogramme horizontal des anomalies par équipe, détaillées par criticité. ' +
    store.synthese.lignes
      .map((l) => `${l.libelle} : ${l.total} dont ${l.Bloquante} bloquantes`)
      .join(' ; ') +
    '.',
)

const slugParCle = computed(() => new Map(store.equipes.map((e) => [e.cle, e.slug])))

function routeDeLEquipe(cle: string) {
  const slug = slugParCle.value.get(cle)
  return slug ? { name: 'equipe', params: { slug } } : undefined
}

function ouvrirEquipe(cle: string): void {
  const route = routeDeLEquipe(cle)
  if (route) void router.push(route)
}

/** Anomalies priorisées sans équipe reconnue : l'écart entre les indicateurs de tête et le « Total Général ». */
const horsSynthese = computed(() => {
  if (store.synthese.horsSynthese === 0) return []
  const connues = new Set(store.equipes.map((e) => e.cle))
  return store.anomalies.filter((a) => a.priorite !== null && !connues.has(a.equipeCle))
})

watchEffect(() => {
  document.title = 'Tableau de bord · Suivi des anomalies'
})
</script>

<template>
  <div class="page">
    <header class="page__entete">
      <h1 class="page__titre">Tableau de bord</h1>
      <p class="page__sous-titre">Suivi des anomalies — vue d'ensemble, toutes équipes</p>
    </header>

    <BandeauxDonnees />

    <section class="indicateurs" aria-label="Indicateurs clés">
      <TuileIndicateur libelle="Total anomalies" :valeur="indicateurs.totalAnomalies" principale>
        <BarreRepartition
          :repartition="{ Mineure: indicateurs.mineures, Majeure: indicateurs.majeures, Bloquante: indicateurs.bloquantes }"
          :total="indicateurs.totalAnomalies"
        />
      </TuileIndicateur>
      <TuileIndicateur
        libelle="Bloquantes"
        ton="bloquante"
        :precision="LIBELLES_PRIORITE.Bloquante.seuil"
        :valeur="indicateurs.bloquantes"
        :total="indicateurs.totalAnomalies"
      />
      <TuileIndicateur
        libelle="Majeures"
        ton="majeure"
        :precision="LIBELLES_PRIORITE.Majeure.seuil"
        :valeur="indicateurs.majeures"
        :total="indicateurs.totalAnomalies"
      />
      <TuileIndicateur
        libelle="Mineures"
        ton="mineure"
        :precision="LIBELLES_PRIORITE.Mineure.seuil"
        :valeur="indicateurs.mineures"
        :total="indicateurs.totalAnomalies"
      />
      <TuileIndicateur
        libelle="Alerte > 4 jours"
        ton="alerte"
        precision="Seuil Takt dépassé"
        :valeur="indicateurs.alertePlus4Jours"
        :total="indicateurs.totalAnomalies"
      />
    </section>

    <div class="page__grille">
      <section class="carte" aria-labelledby="titre-repartition">
        <div class="carte__entete">
          <div>
            <h2 id="titre-repartition" class="carte__titre">Répartition des anomalies par équipe</h2>
            <p class="carte__sous-titre">Nombre d'anomalies par criticité · cliquer sur une équipe pour l'ouvrir</p>
          </div>
          <div class="carte__controles">
            <ControleSegmente v-model="tri" :options="TRIS" etiquette="Ordre des équipes" />
            <ControleSegmente v-model="mode" :options="MODES" etiquette="Type d'histogramme" />
          </div>
        </div>
        <div class="carte__corps">
          <LegendeCriticite v-model="visibles" class="carte__legende" />
          <GraphiqueCriticite
            :lignes="lignesDuGraphique"
            :mode="mode"
            :visibles="visibles"
            :description="description"
            aide-clic="Cliquer pour ouvrir l'analyse de l'équipe"
            @selection="ouvrirEquipe"
          />
        </div>
      </section>

      <section class="carte" aria-labelledby="titre-synthese">
        <div class="carte__entete">
          <div>
            <h2 id="titre-synthese" class="carte__titre">Synthèse par équipe</h2>
            <p class="carte__sous-titre">Les mêmes chiffres, en tableau</p>
          </div>
        </div>
        <div class="carte__corps">
          <TableauSynthese
            premiere-colonne="Équipe"
            libelle-total="Total Général"
            legende="Synthèse par équipe : nombre d'anomalies par criticité"
            :lignes="store.synthese.lignes"
            :total="store.synthese.totalGeneral"
            :lien-vers="routeDeLEquipe"
          />

          <details v-if="horsSynthese.length > 0" class="ecart">
            <summary>
              {{ entier(horsSynthese.length) }} anomalie{{ horsSynthese.length > 1 ? 's' : '' }} sans équipe reconnue
              — comptée{{ horsSynthese.length > 1 ? 's' : '' }} dans les indicateurs, absente{{ horsSynthese.length > 1 ? 's' : '' }} de ce tableau
            </summary>
            <p class="ecart__explication">
              Ces lignes du fichier ont une priorité mais pas d'équipe exploitable ; il s'agit en général d'une
              description sur plusieurs lignes qui a été fragmentée. Excel les traitait de la même façon : c'est
              l'écart entre « Total anomalies » et « Total Général ».
            </p>
            <table class="ecart__table">
              <thead>
                <tr>
                  <th scope="col">Ligne</th>
                  <th scope="col">Numéro</th>
                  <th scope="col">Équipe lue</th>
                  <th scope="col">Jours</th>
                  <th scope="col">Priorité</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in horsSynthese" :key="a.ligne">
                  <td>{{ a.ligne }}</td>
                  <td class="ecart__texte" :title="a.numero">{{ a.numero || '–' }}</td>
                  <td>{{ a.equipe || '(vide)' }}</td>
                  <td>{{ a.joursOuvres ?? '–' }}</td>
                  <td>{{ a.priorite }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.indicateurs {
  display: grid;
  grid-template-columns: minmax(300px, 1.7fr) repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1320px) {
  .indicateurs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .indicateurs > :first-child {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .indicateurs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.carte__controles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.carte__legende {
  margin: 0 0 8px -9px;
}

.ecart {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-2);
  font-size: 13px;
}

.ecart summary {
  color: var(--text-secondary);
  cursor: pointer;
}

.ecart__explication {
  margin: 10px 0;
  color: var(--text-secondary);
}

.ecart__table {
  width: 100%;
  font-size: 12.5px;
}

.ecart__table th,
.ecart__table td {
  padding: 5px 8px 5px 0;
  border-top: 1px solid var(--gridline);
  text-align: left;
  font-variant-numeric: tabular-nums;
}

.ecart__table th {
  color: var(--text-muted);
  font-weight: 550;
}

.ecart__texte {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
