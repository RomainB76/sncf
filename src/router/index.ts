import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * Une route par feuille du classeur : le tableau de bord, puis une page par équipe.
 *
 * Historique en « hash » (#/equipe/nuit) : l'application fonctionne sur n'importe quel serveur
 * statique, y compris dans un sous-dossier, sans règle de réécriture d'URL.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'tableau-de-bord',
      component: () => import('@/views/VueTableauDeBord.vue'),
    },
    {
      path: '/equipe/:slug',
      name: 'equipe',
      component: () => import('@/views/VueEquipe.vue'),
      props: true,
    },
    { path: '/:inconnu(.*)*', redirect: { name: 'tableau-de-bord' } },
  ],
  scrollBehavior: (_vers, _depuis, positionSauvegardee) => positionSauvegardee ?? { top: 0 },
})
