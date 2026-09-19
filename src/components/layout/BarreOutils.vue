<script setup lang="ts">
/** Barre supérieure : état de la source de données et actions globales. */
import { computed, ref } from 'vue'
import Icone, { type NomIcone } from '@/components/Icone.vue'
import { usePreferences } from '@/composables/usePreferences'
import { useTheme, type PreferenceTheme } from '@/composables/useTheme'
import { entier } from '@/domain/libelles'
import { useAnomaliesStore } from '@/stores/anomalies'

defineEmits<{ ouvrirMenu: [] }>()

const store = useAnomaliesStore()
const { preference, themeSuivant } = useTheme()
const { motifsChoisis, basculerMotifs } = usePreferences()

const selecteurFichier = ref<HTMLInputElement>()

const THEMES: Record<PreferenceTheme, { icone: NomIcone; libelle: string }> = {
  auto: { icone: 'auto', libelle: 'Thème : automatique (suit le système)' },
  light: { icone: 'soleil', libelle: 'Thème : clair' },
  dark: { icone: 'lune', libelle: 'Thème : sombre' },
}

const formatHeure = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const statut = computed(() => {
  const source = store.source
  if (!source) return store.etat === 'erreur' ? 'Aucune donnée chargée' : 'Récupération des données depuis clé…'
  const origine = source.type === 'api' ? 'Données clé' : `Fichier importé${source.nom ? ` : ${source.nom}` : ''}`
  return `${origine} · ${formatHeure.format(source.recuLe).replace(' ', ' à ')} · ${entier(store.anomalies.length)} lignes`
})

const occupe = computed(() => store.etat === 'chargement' || store.enActualisation)

async function surFichierChoisi(evenement: Event): Promise<void> {
  const champ = evenement.target as HTMLInputElement
  const fichier = champ.files?.[0]
  // Remise à zéro pour pouvoir choisir deux fois de suite le même fichier.
  champ.value = ''
  if (fichier) await store.importerFichier(fichier)
}
</script>

<template>
  <header class="outils">
    <button type="button" class="bouton bouton--icone outils__menu" aria-label="Ouvrir le menu" @click="$emit('ouvrirMenu')">
      <Icone nom="menu" />
    </button>

    <div class="outils__statut" role="status">
      <span class="outils__voyant" :class="{ 'outils__voyant--actif': occupe, 'outils__voyant--erreur': store.erreur !== null && !occupe }" />
      <span class="outils__texte">{{ statut }}</span>
      <span v-if="store.estDemonstration && store.source?.type === 'api'" class="outils__demo" title="config.json pointe sur l'API simulée du serveur de développement">
        API simulée
      </span>
    </div>

    <div class="outils__actions">
      <input
        ref="selecteurFichier"
        type="file"
        class="visuellement-masque"
        accept=".xlsx,.xlsm,.xls,.csv"
        tabindex="-1"
        aria-hidden="true"
        @change="surFichierChoisi"
      />
      <button type="button" class="bouton outils__importer" :disabled="occupe" @click="selecteurFichier?.click()">
        <Icone nom="importer" />
        <span>Importer un fichier</span>
      </button>
      <button type="button" class="bouton bouton--primaire" :disabled="occupe" @click="store.actualiser()">
        <Icone nom="actualiser" :class="{ 'outils__rotation': occupe }" />
        <span>Actualiser</span>
      </button>
      <button
        type="button"
        class="bouton bouton--icone"
        :class="{ 'outils__bascule--active': motifsChoisis }"
        :aria-pressed="motifsChoisis"
        aria-label="Motifs d'accessibilité sur les graphiques (daltonisme, impression)"
        title="Motifs d'accessibilité sur les graphiques (daltonisme, impression)"
        @click="basculerMotifs"
      >
        <Icone nom="motifs" />
      </button>
      <button
        type="button"
        class="bouton bouton--icone"
        :aria-label="`${THEMES[preference].libelle}. Cliquer pour changer.`"
        :title="THEMES[preference].libelle"
        @click="themeSuivant"
      >
        <Icone :nom="THEMES[preference].icone" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.outils {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  height: var(--topbar-height);
  padding: 0 28px;
  background: color-mix(in srgb, var(--page) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.outils__menu {
  display: none;
}

.outils__statut {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
  color: var(--text-secondary);
  font-size: 13px;
}

.outils__texte {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outils__voyant {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sev-mineure);
}

.outils__voyant--actif {
  background: var(--accent);
  animation: pulsation 1s ease-in-out infinite;
}

.outils__voyant--erreur {
  background: var(--sev-bloquante);
}

.outils__demo {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.outils__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.outils__bascule--active {
  background: var(--accent-wash);
  border-color: var(--accent);
}

.outils__rotation {
  animation: rotation 0.9s linear infinite;
}

@keyframes rotation {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulsation {
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 960px) {
  .outils {
    padding: 0 16px;
  }

  .outils__menu {
    display: inline-flex;
  }
}

@media (max-width: 720px) {
  .outils__importer span,
  .bouton--primaire span {
    display: none;
  }

  .outils__importer,
  .bouton--primaire {
    width: 36px;
    padding: 0;
  }
}
</style>
