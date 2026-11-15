import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'masters',
          name: 'masters',
          component: () => import('@/views/MastersView.vue'),
        },
        {
          path: 'inbound',
          name: 'inbound',
          component: () => import('@/views/InboundView.vue'),
        },
        {
          path: 'inbound/:id',
          name: 'inbound-detail',
          component: () => import('@/views/InboundDetailView.vue'),
        },
        {
          path: 'outbound',
          name: 'outbound',
          component: () => import('@/views/OutboundView.vue'),
        },
        {
          path: 'outbound/:id',
          name: 'outbound-detail',
          component: () => import('@/views/OutboundDetailView.vue'),
        },
        {
          path: 'inventory',
          name: 'inventory',
          component: () => import('@/views/InventoryView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (!to.meta.public && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && session.isAuthenticated) {
    return { name: 'dashboard' }
  }
  return true
})

export default router
