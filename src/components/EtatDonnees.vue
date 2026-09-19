<script setup lang="ts">
/** Écran plein cadre tant qu'aucune donnée n'est disponible : chargement initial ou erreur. */
import { ref } from 'vue'
import Icone from '@/components/Icone.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
const selecteurFichier = ref<HTMLInputElement>()

async function surFichierChoisi(evenement: Event): Promise<void> {
  const champ = evenement.target as HTMLInputElement
  const fichier = champ.files?.[0]
  champ.value = ''
  if (fichier) await store.importerFichier(fichier)
}
</script>

<template>
  <section v-if="store.etat === 'erreur' && store.erreur" class="etat" role="alert">
    <span class="etat__icone etat__icone--erreur"><Icone nom="alerte" :taille="22" /></span>
    <h1 class="etat__titre">{{ store.erreur.titre }}</h1>
    <p class="etat__message">{{ store.erreur.message }}</p>
    <p v-if="store.erreur.detail" class="etat__detail">{{ store.erreur.detail }}</p>

    <div class="etat__actions">
      <button type="button" class="bouton bouton--primaire" @click="store.actualiser()">
        <Icone nom="actualiser" />
        Réessayer
      </button>
      <input
        ref="selecteurFichier"
        type="file"
        class="visuellement-masque"
        accept=".xlsx,.xlsm,.xls,.csv"
        tabindex="-1"
        aria-hidden="true"
        @change="surFichierChoisi"
      />
      <button type="button" class="bouton" @click="selecteurFichier?.click()">
        <Icone nom="importer" />
        Importer un fichier Excel
      </button>
    </div>

    <p class="etat__aide">
      L'URL de l'API et le token JWT se règlent dans <code>public/config.json</code>
      (<code>config.json</code> à côté de <code>index.html</code> une fois l'application déployée).
      Le fichier est relu à chaque actualisation : inutile de redémarrer.
    </p>
  </section>

  <section v-else class="etat" role="status">
    <span class="etat__rotation" aria-hidden="true" />
    <p class="etat__message">Récupération des données depuis clé…</p>
  </section>
</template>

<style scoped>
.etat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 620px;
  margin: 12vh auto 0;
  padding: 0 24px;
  text-align: center;
}

.etat__icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

.etat__icone--erreur {
  background: var(--sev-bloquante);
  color: #ffffff;
}

.etat__titre {
  font-size: 20px;
  font-weight: 650;
}

.etat__message {
  color: var(--text-secondary);
}

.etat__detail {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.etat__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.etat__aide {
  margin-top: 14px;
  color: var(--text-muted);
  font-size: 13px;
}

code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-3);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.etat__rotation {
  width: 30px;
  height: 30px;
  border: 3px solid var(--surface-3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: rotation 0.8s linear infinite;
}

@keyframes rotation {
  to {
    transform: rotate(360deg);
  }
}
</style>
