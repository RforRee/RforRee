<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const nav = [
  { to: '/', label: 'Dashboard', match: 'dashboard' },
  { to: '/masters', label: 'Master Data', match: 'masters' },
  { to: '/inbound', label: 'Inbound', match: 'inbound' },
  { to: '/outbound', label: 'Outbound', match: 'outbound' },
  { to: '/inventory', label: 'Inventory', match: 'inventory' },
]

const title = computed(() => import.meta.env.VITE_APP_TITLE || 'RforRee WMS')

function logout() {
  session.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
    <aside class="border-b border-white/10 bg-ink-950/90 lg:border-b-0 lg:border-r">
      <div class="flex items-center justify-between gap-3 px-5 py-5 lg:block">
        <div>
          <p class="font-display text-3xl font-bold uppercase tracking-wide text-dock-300">
            RforRee
          </p>
          <p class="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">WMS floor console</p>
        </div>
        <button class="btn-secondary lg:hidden" type="button" @click="logout">Logout</button>
      </div>

      <nav class="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          :class="route.name === item.match ? 'bg-dock-400/15 text-dock-300' : ''"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="hidden border-t border-white/10 p-4 lg:block">
        <p class="text-xs uppercase tracking-wide text-slate-500">Station</p>
        <p class="mt-1 font-medium text-slate-100">{{ session.operator }}</p>
        <p class="mono mt-1 text-slate-400">
          {{ session.client?.code }}
          <span v-if="session.warehouse"> / {{ session.warehouse.code }}</span>
        </p>
        <button class="btn-secondary mt-4 w-full" type="button" @click="logout">Sign out</button>
      </div>
    </aside>

    <div class="min-w-0">
      <header class="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h1 class="font-display text-2xl font-semibold uppercase tracking-wide text-slate-100">
            {{ route.name }}
          </h1>
          <p class="text-sm text-slate-400">{{ title }}</p>
        </div>
        <div class="hidden text-right sm:block">
          <p class="text-sm text-slate-300">{{ session.client?.name }}</p>
          <p class="mono text-xs text-slate-500">{{ session.warehouse?.name || 'All warehouses' }}</p>
        </div>
      </header>
      <main class="p-4 sm:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
