<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  binsApi,
  inventoryApi,
  skusApi,
  warehousesApi,
  zonesApi,
} from '@/api/client'
import type {
  Bin,
  InventoryBalance,
  InventoryTransaction,
  Sku,
  Warehouse,
  Zone,
} from '@/api/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const warehouses = ref<Warehouse[]>([])
const zones = ref<Zone[]>([])
const bins = ref<Bin[]>([])
const skus = ref<Sku[]>([])
const balances = ref<InventoryBalance[]>([])
const ledger = ref<InventoryTransaction[]>([])

const warehouseId = ref(session.warehouse?.id || '')
const binId = ref('')
const skuId = ref('')
const lotNumber = ref('')
const tab = ref<'balances' | 'ledger'>('balances')
const loading = ref(false)
const error = ref('')

const skuMap = computed(() => new Map(skus.value.map((s) => [s.id, s])))
const binMap = computed(() => new Map(bins.value.map((b) => [b.id, b])))

async function loadMasters() {
  const clientId = session.client?.id
  const [wh, skuList] = await Promise.all([
    warehousesApi.list(clientId),
    skusApi.list(clientId),
  ])
  warehouses.value = wh.data
  skus.value = skuList.data
  if (!warehouseId.value && session.warehouse?.id) {
    warehouseId.value = session.warehouse.id
  }
  await loadBinsForWarehouse()
}

async function loadBinsForWarehouse() {
  bins.value = []
  binId.value = ''
  if (!warehouseId.value) return
  const { data: z } = await zonesApi.list(warehouseId.value)
  zones.value = z
  const allBins: Bin[] = []
  for (const zone of z) {
    const { data } = await binsApi.list(zone.id)
    allBins.push(...data)
  }
  bins.value = allBins
}

async function search() {
  loading.value = true
  error.value = ''
  try {
    const params = {
      clientId: session.client?.id,
      warehouseId: warehouseId.value || undefined,
      binId: binId.value || undefined,
      skuId: skuId.value || undefined,
      lotNumber: lotNumber.value.trim() || undefined,
    }
    if (tab.value === 'balances') {
      const { data } = await inventoryApi.balances(params)
      balances.value = data
    } else {
      const { data } = await inventoryApi.transactions({
        clientId: params.clientId,
        skuId: params.skuId,
        binId: params.binId,
        limit: '200',
      })
      ledger.value = data
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Query failed'
  } finally {
    loading.value = false
  }
}

function fmtDate(v?: string | null) {
  return v ? String(v).slice(0, 10) : '—'
}

watch(warehouseId, loadBinsForWarehouse)
watch(tab, search)
onMounted(async () => {
  await loadMasters()
  await search()
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="font-display text-3xl font-semibold uppercase text-white">Inventory</h2>
      <p class="text-sm text-slate-400">
        Filter on-hand balances by Client / Warehouse / Bin / SKU / Lot#, or inspect the ledger.
      </p>
    </div>

    <div class="panel space-y-4 p-4">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn"
          :class="tab === 'balances' ? 'btn-primary' : 'btn-secondary'"
          @click="tab = 'balances'"
        >
          Balances
        </button>
        <button
          type="button"
          class="btn"
          :class="tab === 'ledger' ? 'btn-primary' : 'btn-secondary'"
          @click="tab = 'ledger'"
        >
          Ledger
        </button>
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label class="text-sm">
          <span class="mb-1 block text-slate-400">Warehouse</span>
          <select v-model="warehouseId" class="field">
            <option value="">All</option>
            <option v-for="w in warehouses" :key="w.id" :value="w.id">
              {{ w.code }}
            </option>
          </select>
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-slate-400">Bin</span>
          <select v-model="binId" class="field">
            <option value="">All</option>
            <option v-for="b in bins" :key="b.id" :value="b.id">
              {{ b.code }}{{ b.barcode ? ` (${b.barcode})` : '' }}
            </option>
          </select>
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-slate-400">SKU</span>
          <select v-model="skuId" class="field">
            <option value="">All</option>
            <option v-for="s in skus" :key="s.id" :value="s.id">
              {{ s.code }} — {{ s.name }}
            </option>
          </select>
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-slate-400">Lot#</span>
          <input
            v-model="lotNumber"
            class="field font-mono"
            placeholder="Scan / type lot"
            @keyup.enter="search"
          />
        </label>
        <div class="flex items-end">
          <button class="btn-primary w-full" type="button" :disabled="loading" @click="search">
            {{ loading ? 'Querying…' : 'Search' }}
          </button>
        </div>
      </div>
      <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
    </div>

    <div v-if="tab === 'balances'" class="table-wrap panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Bin</th>
            <th>Lot#</th>
            <th>ED</th>
            <th>MD</th>
            <th class="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in balances" :key="row.id">
            <td>
              <div class="mono font-medium text-dock-300">
                {{ skuMap.get(row.skuId)?.code || row.skuId.slice(-6) }}
              </div>
              <div class="text-xs text-slate-500">{{ skuMap.get(row.skuId)?.name }}</div>
            </td>
            <td class="mono">{{ binMap.get(row.binId)?.code || row.binId.slice(-6) }}</td>
            <td class="mono">{{ row.lotNumber || '—' }}</td>
            <td class="mono">{{ fmtDate(row.expiryDate) }}</td>
            <td class="mono">{{ fmtDate(row.manufactureDate) }}</td>
            <td class="text-right font-semibold tabular-nums">{{ row.quantity }}</td>
          </tr>
          <tr v-if="!balances.length">
            <td colspan="6" class="text-slate-500">No balances for current filters</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="table-wrap panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>SKU</th>
            <th>Bin</th>
            <th>Lot#</th>
            <th>ED</th>
            <th class="text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in ledger" :key="row.id">
            <td class="mono text-xs">{{ new Date(row.createdAt).toLocaleString() }}</td>
            <td>
              <span class="badge bg-white/10">{{ row.type }}</span>
            </td>
            <td class="mono">{{ skuMap.get(row.skuId)?.code || row.skuId.slice(-6) }}</td>
            <td class="mono">{{ binMap.get(row.binId)?.code || row.binId.slice(-6) }}</td>
            <td class="mono">{{ row.lotNumber || '—' }}</td>
            <td class="mono">{{ fmtDate(row.expiryDate) }}</td>
            <td
              class="text-right font-semibold tabular-nums"
              :class="Number(row.quantity) < 0 ? 'text-rose-300' : 'text-bay-400'"
            >
              {{ row.quantity }}
            </td>
          </tr>
          <tr v-if="!ledger.length">
            <td colspan="7" class="text-slate-500">No ledger rows</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
