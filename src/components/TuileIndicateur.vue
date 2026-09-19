<script setup lang="ts">
/**
 * Tuile d'indicateur : un chiffre clé n'est pas un graphique, c'est un nombre bien mis en scène.
 * La valeur reste en encre normale ; la couleur de criticité est portée par l'icône et la jauge,
 * toujours accompagnées du libellé.
 */
import { computed } from 'vue'
import Icone, { type NomIcone } from '@/components/Icone.vue'
import { entier, part as formaterPart } from '@/domain/libelles'

export type TonTuile = 'neutre' | 'mineure' | 'majeure' | 'bloquante' | 'alerte'

const props = withDefaults(
  defineProps<{
    libelle: string
    valeur: number
    ton?: TonTuile
    /** Seuil ou précision affichée sous le libellé (« > 4 j ouvrés »). */
    precision?: string
    /** Total de référence : affiche la jauge et la part en pourcentage. */
    total?: number
    /** Tuile principale du tableau de bord (chiffre plus grand, contenu libre en dessous). */
    principale?: boolean
  }>(),
  { ton: 'neutre', precision: undefined, total: undefined, principale: false },
)

const ICONES: Record<TonTuile, NomIcone> = {
  neutre: 'total',
  mineure: 'mineure',
  majeure: 'majeure',
  bloquante: 'bloquante',
  alerte: 'alerte',
}

/** Une alerte à zéro n'a rien d'alarmant : la tuile repasse en ton neutre. */
const tonEffectif = computed<TonTuile>(() =>
  props.ton === 'alerte' && props.valeur === 0 ? 'neutre' : props.ton,
)
const icone = computed<NomIcone>(() =>
  props.ton === 'alerte' && props.valeur === 0 ? 'valide' : ICONES[props.ton],
)
const largeurJauge = computed(() =>
  props.total && props.total > 0 ? `${Math.min(100, (props.valeur / props.total) * 100)}%` : '0%',
)
</script>

<template>
  <article class="tuile" :class="[`tuile--${tonEffectif}`, { 'tuile--principale': principale }]">
    <header class="tuile__entete">
      <span class="tuile__icone"><Icone :nom="icone" :taille="16" /></span>
      <span class="tuile__titres">
        <span class="tuile__libelle">{{ libelle }}</span>
        <span v-if="precision" class="tuile__precision">{{ precision }}</span>
      </span>
    </header>

    <p class="tuile__valeur">{{ entier(valeur) }}</p>

    <div v-if="total !== undefined" class="tuile__pied">
      <div class="tuile__jauge" aria-hidden="true"><span :style="{ width: largeurJauge }" /></div>
      <p class="tuile__part">{{ formaterPart(valeur, total) }} du total</p>
    </div>

    <div v-if="$slots.default" class="tuile__contenu"><slot /></div>
  </article>
</template>

<style scoped>
.tuile {
  --ton: var(--sev-neutre);
  --encre-icone: #0b0b0b;

  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 16px 18px 18px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-card);
}

.tuile--mineure {
  --ton: var(--sev-mineure);
}

.tuile--majeure {
  --ton: var(--sev-majeure);
}

.tuile--bloquante,
.tuile--alerte {
  --ton: var(--sev-bloquante);
  --encre-icone: #ffffff;
}

.tuile--alerte {
  background: color-mix(in srgb, var(--sev-bloquante) 7%, var(--surface-1));
  border-color: color-mix(in srgb, var(--sev-bloquante) 38%, transparent);
}

.tuile__entete {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.tuile__icone {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--ton);
  color: var(--encre-icone);
}

.tuile--neutre .tuile__icone {
  background: var(--surface-3);
  color: var(--text-primary);
}

.tuile__titres {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.tuile__libelle {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.tuile__precision {
  font-size: 12px;
  color: var(--text-muted);
}

.tuile__valeur {
  font-size: 34px;
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.tuile--principale .tuile__valeur {
  font-size: 52px;
}

.tuile__pied {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}

/* Jauge : la piste est un ton plus clair de la même teinte que le remplissage. */
.tuile__jauge {
  height: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ton) 20%, transparent);
  overflow: hidden;
}

.tuile__jauge span {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--ton);
  transition: width 0.4s ease-out;
}

.tuile__part {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.tuile__contenu {
  margin-top: auto;
}
</style>
