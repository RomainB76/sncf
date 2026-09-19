import { createRouter, createWebHashHistory } from 'vue-router'

/**
 * One route per sheet of the workbook: the dashboard, then one page per team.
 *
 * Hash history (#/team/nuit): the application works on any static server, including in a
 * sub-folder, without any URL rewriting rule.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/team/:slug',
      name: 'team',
      component: () => import('@/views/TeamView.vue'),
      props: true,
    },
    { path: '/:unknown(.*)*', redirect: { name: 'dashboard' } },
  ],
  scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 },
})
