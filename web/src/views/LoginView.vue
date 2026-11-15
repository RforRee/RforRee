<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clientsApi, healthApi, warehousesApi } from '@/api/client'
import type { Client, Warehouse } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()

const clients = ref<Client[]>([])
const warehouses = ref<Warehouse[]>([])
const clientId = ref('')
const warehouseId = ref('')
const operator = ref(session.operator || '')
const apiKey = ref(session.apiKey || '')
const error = ref('')
const loading = ref(false)
const apiOk = ref<boolean | null>(null)

async function loadClients() {
  const { data } = await clientsApi.list()
  clients.value = data
  if (!clientId.value && data[0]) clientId.value = data[0].id
  await loadWarehouses()
}

async function loadWarehouses() {
  if (!clientId.value) {
    warehouses.value = []
    return
  }
  const { data } = await warehousesApi.list(clientId.value)
  warehouses.value = data
  if (!data.find((w) => w.id === warehouseId.value)) {
    warehouseId.value = data[0]?.id || ''
  }
}

async function submit() {
  error.value = ''
  const client = clients.value.find((c) => c.id === clientId.value)
  if (!client || !operator.value.trim()) {
    error.value = 'Select a client and enter operator name.'
    return
  }
  loading.value = true
  try {
    session.login({
      client,
      warehouse: warehouses.value.find((w) => w.id === warehouseId.value) || null,
      operator: operator.value,
      apiKey: apiKey.value,
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await healthApi.check()
    apiOk.value = true
  } catch {
    apiOk.value = false
  }
  try {
    await loadClients()
  } catch (e) {
    error.value =
      'Cannot reach API. Start backend on :3000 or set VITE_API_BASE_URL. ' +
      (e instanceof Error ? e.message : '')
  }
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-4">
    <div class="panel w-full max-w-lg p-6 sm:p-8">
      <p class="font-display text-4xl font-bold uppercase tracking-wide text-dock-300">RforRee</p>
      <h1 class="mt-2 text-xl font-semibold text-white">Station login</h1>
      <p class="mt-1 text-sm text-slate-400">
        Pick a client / warehouse for floor operations. Optional API key unlocks sync &amp; external
        routes.
      </p>

      <div
        class="mt-4 rounded-lg border px-3 py-2 text-sm"
        :class="
          apiOk === false
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
            : 'border-bay-500/30 bg-bay-500/10 text-bay-400'
        "
      >
        <span v-if="apiOk === null">Checking API…</span>
        <span v-else-if="apiOk">API connected</span>
        <span v-else>API unreachable — check Docker / backend</span>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Operator</span>
          <input v-model="operator" class="field" placeholder="e.g. Dock-01" required />
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Client</span>
          <select v-model="clientId" class="field" required @change="loadWarehouses">
            <option disabled value="">Select client</option>
            <option v-for="c in clients" :key="c.id" :value="c.id">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Warehouse (optional)</span>
          <select v-model="warehouseId" class="field">
            <option value="">All warehouses</option>
            <option v-for="w in warehouses" :key="w.id" :value="w.id">
              {{ w.code }} — {{ w.name }}
            </option>
          </select>
        </label>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">API key (optional)</span>
          <input
            v-model="apiKey"
            class="field font-mono"
            type="password"
            placeholder="wms_…"
            autocomplete="off"
          />
        </label>

        <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

        <button class="btn-primary w-full" type="submit" :disabled="loading">
          {{ loading ? 'Entering…' : 'Enter console' }}
        </button>
      </form>
    </div>
  </div>
</template>
