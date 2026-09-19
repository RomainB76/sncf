<script setup lang="ts">
/**
 * Bandeaux affichés au-dessus des pages quand des données sont déjà à l'écran :
 * échec de la dernière actualisation (les chiffres affichés sont alors ceux d'avant)
 * et avertissements émis à la lecture du fichier.
 */
import Icone from '@/components/Icone.vue'
import { useAnomaliesStore } from '@/stores/anomalies'

const store = useAnomaliesStore()
</script>

<template>
  <div v-if="store.erreur || store.avertissements.length > 0" class="bandeaux">
    <div v-if="store.erreur" class="bandeau bandeau--erreur" role="alert">
      <span class="bandeau__icone"><Icone nom="alerte" :taille="16" /></span>
      <div class="bandeau__texte">
        <p>
          <strong>{{ store.erreur.titre }}.</strong> {{ store.erreur.message }}
          Les données affichées sont celles du dernier chargement réussi.
        </p>
        <p v-if="store.erreur.detail" class="bandeau__detail">{{ store.erreur.detail }}</p>
      </div>
      <button type="button" class="bouton bouton--icone bandeau__fermer" aria-label="Masquer ce message" @click="store.fermerErreur()">
        <Icone nom="fermer" :taille="16" />
      </button>
    </div>

    <div v-for="(avertissement, i) in store.avertissements" :key="i" class="bandeau" role="note">
      <span class="bandeau__icone bandeau__icone--info"><Icone nom="info" :taille="16" /></span>
      <p class="bandeau__texte">{{ avertissement }}</p>
    </div>
  </div>
</template>

<style scoped>
.bandeaux {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.bandeau {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  background: var(--surface-1);
  font-size: 13.5px;
}

.bandeau--erreur {
  border-color: color-mix(in srgb, var(--sev-bloquante) 45%, transparent);
  background: color-mix(in srgb, var(--sev-bloquante) 7%, var(--surface-1));
}

.bandeau__icone {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--sev-bloquante);
  color: #ffffff;
}

.bandeau__icone--info {
  background: var(--surface-3);
  color: var(--text-primary);
}

.bandeau__texte {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.bandeau__detail {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.bandeau__fermer {
  flex: none;
  width: 28px;
  height: 28px;
  border-color: transparent;
  background: transparent;
}
</style>
