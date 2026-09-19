<script setup lang="ts">
/**
 * Détail des anomalies d'une équipe. Dans Excel, on l'obtenait en filtrant la feuille
 * « Données Globales » ; ici la liste se filtre par criticité, machine et texte, et se trie.
 */
import { computed, ref } from 'vue'
import ControleSegmente from '@/components/ControleSegmente.vue'
import Icone from '@/components/Icone.vue'
import { dateCourte, entier, LIBELLES_PRIORITE } from '@/domain/libelles'
import { cleDeRegroupement } from '@/domain/normalisation'
import { estEnAlerte } from '@/domain/priorite'
import { PRIORITES, type Anomalie, type Priorite, type Reference } from '@/domain/types'

const props = defineProps<{
  anomalies: readonly Anomalie[]
  machines: readonly Reference[]
}>()

/** Machine filtrée (clé normalisée) ; pilotable depuis le graphique et le tableau de la page. */
const machine = defineModel<string | null>('machine', { default: null })

type FiltrePriorite = 'toutes' | Priorite
const filtrePriorite = ref<FiltrePriorite>('toutes')
const recherche = ref('')

type CleTri = 'numero' | 'priorite' | 'jours' | 'libelle' | 'rame' | 'date' | 'auteur'
const tri = ref<{ cle: CleTri; sens: 1 | -1 }>({ cle: 'jours', sens: -1 })

const RANG_PRIORITE: Record<Priorite, number> = { Mineure: 1, Majeure: 2, Bloquante: 3 }

const optionsPriorite = computed(() => {
  const compte = (p: Priorite) => props.anomalies.filter((a) => a.priorite === p).length
  return [
    { valeur: 'toutes' as FiltrePriorite, libelle: `Toutes (${props.anomalies.length})` },
    ...[...PRIORITES].reverse().map((p) => ({
      valeur: p as FiltrePriorite,
      libelle: `${LIBELLES_PRIORITE[p].pluriel} (${compte(p)})`,
    })),
  ]
})

const lignes = computed(() => {
  const texte = cleDeRegroupement(recherche.value)
  const filtrees = props.anomalies.filter((a) => {
    if (filtrePriorite.value !== 'toutes' && a.priorite !== filtrePriorite.value) return false
    if (machine.value !== null && a.rameCle !== machine.value) return false
    if (texte === '') return true
    return cleDeRegroupement(
      [a.numero, a.libelle, a.description, a.commentaire, a.creeePar, a.vehicule, a.rame].join(' '),
    ).includes(texte)
  })

  const { cle, sens } = tri.value
  const comparer = (a: Anomalie, b: Anomalie): number => {
    switch (cle) {
      case 'numero':
        return (Number(a.numero) || 0) - (Number(b.numero) || 0) || a.numero.localeCompare(b.numero, 'fr')
      case 'priorite':
        return (a.priorite ? RANG_PRIORITE[a.priorite] : 0) - (b.priorite ? RANG_PRIORITE[b.priorite] : 0)
      case 'jours':
        return (a.joursOuvres ?? -1) - (b.joursOuvres ?? -1)
      case 'libelle':
        return a.libelle.localeCompare(b.libelle, 'fr')
      case 'rame':
        return a.rame.localeCompare(b.rame, 'fr') || a.vehicule.localeCompare(b.vehicule, 'fr')
      case 'date':
        return (a.dateCreation ?? '').localeCompare(b.dateCreation ?? '')
      case 'auteur':
        return a.creeePar.localeCompare(b.creeePar, 'fr')
    }
  }
  // Tri stable : à égalité, l'ordre du fichier source est conservé.
  return [...filtrees].sort((a, b) => comparer(a, b) * sens || a.ligne - b.ligne)
})

function trierPar(cle: CleTri): void {
  tri.value =
    tri.value.cle === cle
      ? { cle, sens: tri.value.sens === 1 ? -1 : 1 }
      : { cle, sens: cle === 'jours' || cle === 'priorite' || cle === 'date' ? -1 : 1 }
}

function ariaTri(cle: CleTri): 'ascending' | 'descending' | 'none' {
  if (tri.value.cle !== cle) return 'none'
  return tri.value.sens === 1 ? 'ascending' : 'descending'
}

const filtresActifs = computed(
  () => filtrePriorite.value !== 'toutes' || machine.value !== null || recherche.value.trim() !== '',
)

function reinitialiser(): void {
  filtrePriorite.value = 'toutes'
  machine.value = null
  recherche.value = ''
}

const COLONNES_TRIABLES: { cle: CleTri; libelle: string; numerique?: boolean }[] = [
  { cle: 'numero', libelle: 'N°', numerique: true },
  { cle: 'priorite', libelle: 'Priorité' },
  { cle: 'jours', libelle: 'Jours ouvrés', numerique: true },
  { cle: 'libelle', libelle: 'Libellé' },
]
</script>

<template>
  <section class="detail">
    <div class="detail__filtres">
      <ControleSegmente v-model="filtrePriorite" :options="optionsPriorite" etiquette="Filtrer par priorité" />

      <label class="detail__champ">
        <span class="visuellement-masque">Filtrer par machine</span>
        <select
          :value="machine ?? ''"
          @change="machine = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">Toutes les machines</option>
          <option v-for="m in machines" :key="m.cle" :value="m.cle">{{ m.libelle }}</option>
        </select>
      </label>

      <label class="detail__champ detail__champ--recherche">
        <span class="visuellement-masque">Rechercher dans les anomalies</span>
        <Icone nom="recherche" :taille="15" />
        <input v-model="recherche" type="search" placeholder="Rechercher (n°, libellé, description…)" />
      </label>

      <p class="detail__compte" aria-live="polite">
        {{ entier(lignes.length) }} / {{ entier(anomalies.length) }}
        <button v-if="filtresActifs" type="button" class="detail__raz" @click="reinitialiser">
          Réinitialiser
        </button>
      </p>
    </div>

    <div class="detail__defilement">
      <table class="detail__table">
        <caption class="visuellement-masque">
          Détail des anomalies de l'équipe
        </caption>
        <thead>
          <tr>
            <th
              v-for="colonne in COLONNES_TRIABLES"
              :key="colonne.cle"
              scope="col"
              :class="{ 'detail__num': colonne.numerique }"
              :aria-sort="ariaTri(colonne.cle)"
            >
              <button type="button" class="detail__tri" @click="trierPar(colonne.cle)">
                {{ colonne.libelle }}
                <Icone
                  v-if="tri.cle === colonne.cle"
                  :nom="tri.sens === 1 ? 'tri-asc' : 'tri-desc'"
                  :taille="13"
                />
              </button>
            </th>
            <th scope="col" class="detail__large">Description</th>
            <th scope="col" :aria-sort="ariaTri('rame')">
              <button type="button" class="detail__tri" @click="trierPar('rame')">
                Rame / Véhicule
                <Icone v-if="tri.cle === 'rame'" :nom="tri.sens === 1 ? 'tri-asc' : 'tri-desc'" :taille="13" />
              </button>
            </th>
            <th scope="col" :aria-sort="ariaTri('date')">
              <button type="button" class="detail__tri" @click="trierPar('date')">
                Créée le
                <Icone v-if="tri.cle === 'date'" :nom="tri.sens === 1 ? 'tri-asc' : 'tri-desc'" :taille="13" />
              </button>
            </th>
            <th scope="col" :aria-sort="ariaTri('auteur')">
              <button type="button" class="detail__tri" @click="trierPar('auteur')">
                Créée par
                <Icone v-if="tri.cle === 'auteur'" :nom="tri.sens === 1 ? 'tri-asc' : 'tri-desc'" :taille="13" />
              </button>
            </th>
            <th scope="col">SEF</th>
            <th scope="col" class="detail__large">Commentaire</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in lignes" :key="a.ligne">
            <td class="detail__num detail__numero">{{ a.numero || '–' }}</td>
            <td>
              <span v-if="a.priorite" class="detail__priorite">
                <span class="pastille" :class="`pastille--${LIBELLES_PRIORITE[a.priorite].classe}`" />
                {{ a.priorite }}
              </span>
              <span v-else class="detail__attenue" title="Moins d'un jour ouvré : pas encore de priorité">–</span>
            </td>
            <td class="detail__num">
              <span :class="{ 'detail__alerte': estEnAlerte(a.joursOuvres) }">
                {{ a.joursOuvres === null ? '–' : entier(a.joursOuvres) }}
              </span>
            </td>
            <td>{{ a.libelle || '–' }}</td>
            <td class="detail__large"><p class="detail__texte" :title="a.description">{{ a.description || '–' }}</p></td>
            <td>
              {{ a.rame || '–' }}
              <span v-if="a.vehicule && a.vehicule !== a.rame" class="detail__attenue"> · {{ a.vehicule }}</span>
            </td>
            <td class="detail__date">{{ dateCourte(a.dateCreation) }}</td>
            <td>{{ a.creeePar || '–' }}</td>
            <td>{{ a.sef || '–' }}</td>
            <td class="detail__large"><p class="detail__texte" :title="a.commentaire">{{ a.commentaire || '–' }}</p></td>
          </tr>
          <tr v-if="lignes.length === 0">
            <td colspan="10" class="detail__vide">
              {{ anomalies.length === 0 ? 'Aucune anomalie pour cette équipe.' : 'Aucune anomalie ne correspond aux filtres.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.detail__filtres {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 0 20px 14px;
}

.detail__champ {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  color: var(--text-muted);
}

.detail__champ:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.detail__champ select,
.detail__champ input {
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 13.5px;
}

.detail__champ select option {
  background: var(--surface-1);
  color: var(--text-primary);
}

.detail__champ--recherche {
  flex: 1 1 240px;
  max-width: 360px;
}

.detail__champ--recherche input {
  flex: 1;
  min-width: 0;
}

.detail__compte {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.detail__raz {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-strong);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}

.detail__defilement {
  overflow-x: auto;
  border-top: 1px solid var(--gridline);
}

.detail__table {
  width: 100%;
  min-width: 1080px;
  font-size: 13px;
}

th,
td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--gridline);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}

th:first-child,
td:first-child {
  padding-left: 20px;
}

thead th {
  position: sticky;
  top: 0;
  padding-top: 10px;
  padding-bottom: 10px;
  background: var(--surface-1);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 550;
  border-bottom-color: var(--baseline);
}

tbody tr:hover td {
  background: var(--surface-2);
}

.detail__tri {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.detail__tri:hover {
  color: var(--text-primary);
}

.detail__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.detail__numero {
  color: var(--text-secondary);
}

.detail__priorite {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 550;
}

.detail__alerte {
  font-weight: 700;
}

.detail__attenue {
  color: var(--text-muted);
}

.detail__date {
  font-variant-numeric: tabular-nums;
}

.detail__large {
  white-space: normal;
  min-width: 220px;
  max-width: 380px;
}

.detail__texte {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  white-space: pre-line;
}

.detail__vide {
  padding: 28px 20px;
  color: var(--text-muted);
  text-align: center;
}
</style>
