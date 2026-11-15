<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  binsApi,
  clientsApi,
  skusApi,
  warehousesApi,
  zonesApi,
} from '@/api/client'
import type { Bin, Client, Sku, Warehouse, Zone } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const tab = ref<'clients' | 'locations' | 'skus'>('locations')
const message = ref('')
const error = ref('')

const clients = ref<Client[]>([])
const warehouses = ref<Warehouse[]>([])
const zones = ref<Zone[]>([])
const bins = ref<Bin[]>([])
const skus = ref<Sku[]>([])

const clientForm = ref({ code: '', name: '' })
const whForm = ref({ code: '', name: '', address: '' })
const zoneForm = ref({ warehouseId: '', code: '', name: '' })
const binForm = ref({ zoneId: '', code: '', name: '', barcode: '' })
const skuForm = ref({ code: '', name: '', uom: 'EA', barcode: '' })

const selectedSku = computed(() => skus.value.find((s) => s.barcode && s.id === skuForm.value.code) || skus.value[0])

async function refresh() {
  error.value = ''
  const clientId = session.client?.id
  const [c, w, s] = await Promise.all([
    clientsApi.list(),
    warehousesApi.list(clientId),
    skusApi.list(clientId),
  ])
  clients.value = c.data
  warehouses.value = w.data
  skus.value = s.data
  if (!zoneForm.value.warehouseId && w.data[0]) {
    zoneForm.value.warehouseId = session.warehouse?.id || w.data[0].id
  }
  await loadZonesAndBins()
}

async function loadZonesAndBins() {
  zones.value = []
  bins.value = []
  const whId = zoneForm.value.warehouseId || session.warehouse?.id
  if (!whId) return
  const { data: z } = await zonesApi.list(whId)
  zones.value = z
  if (!binForm.value.zoneId && z[0]) binForm.value.zoneId = z[0].id
  const all: Bin[] = []
  for (const zone of z) {
    const { data } = await binsApi.list(zone.id)
    all.push(...data)
  }
  bins.value = all
}

async function createClient() {
  await clientsApi.create(clientForm.value)
  message.value = `Client ${clientForm.value.code} created`
  clientForm.value = { code: '', name: '' }
  await refresh()
}

async function createWarehouse() {
  if (!session.client) return
  await warehousesApi.create({
    clientId: session.client.id,
    ...whForm.value,
  })
  message.value = `Warehouse ${whForm.value.code} created`
  whForm.value = { code: '', name: '', address: '' }
  await refresh()
}

async function createZone() {
  await zonesApi.create(zoneForm.value)
  message.value = `Zone ${zoneForm.value.code} created`
  await loadZonesAndBins()
}

async function createBin() {
  await binsApi.create(binForm.value)
  message.value = `Bin ${binForm.value.code} created`
  await loadZonesAndBins()
}

async function createSku() {
  if (!session.client) return
  await skusApi.create({ clientId: session.client.id, ...skuForm.value })
  message.value = `SKU ${skuForm.value.code} created`
  skuForm.value = { code: '', name: '', uom: 'EA', barcode: '' }
  await refresh()
}

onMounted(async () => {
  try {
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load masters'
  }
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="font-display text-3xl font-semibold uppercase text-white">Master data</h2>
      <p class="text-sm text-slate-400">Clients, warehouse hierarchy, and SKU barcodes.</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="t in [
          { id: 'locations', label: 'Warehouse & Bin' },
          { id: 'skus', label: 'SKU Master' },
          { id: 'clients', label: 'Clients' },
        ]"
        :key="t.id"
        type="button"
        class="btn"
        :class="tab === t.id ? 'btn-primary' : 'btn-secondary'"
        @click="tab = t.id as typeof tab"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div v-if="tab === 'clients'" class="grid gap-4 lg:grid-cols-2">
      <form class="panel space-y-3 p-4" @submit.prevent="createClient">
        <h3 class="font-semibold">New client</h3>
        <input v-model="clientForm.code" class="field font-mono" placeholder="Code" required />
        <input v-model="clientForm.name" class="field" placeholder="Name" required />
        <button class="btn-primary" type="submit">Create client</button>
      </form>
      <div class="table-wrap panel">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in clients" :key="c.id">
              <td class="mono">{{ c.code }}</td>
              <td>{{ c.name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="tab === 'locations'" class="space-y-4">
      <div class="grid gap-4 xl:grid-cols-3">
        <form class="panel space-y-3 p-4" @submit.prevent="createWarehouse">
          <h3 class="font-semibold">Warehouse</h3>
          <input v-model="whForm.code" class="field font-mono" placeholder="Code" required />
          <input v-model="whForm.name" class="field" placeholder="Name" required />
          <input v-model="whForm.address" class="field" placeholder="Address" />
          <button class="btn-primary" type="submit">Add warehouse</button>
        </form>
        <form class="panel space-y-3 p-4" @submit.prevent="createZone">
          <h3 class="font-semibold">Zone</h3>
          <select v-model="zoneForm.warehouseId" class="field" required @change="loadZonesAndBins">
            <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.code }}</option>
          </select>
          <input v-model="zoneForm.code" class="field font-mono" placeholder="Zone code" required />
          <input v-model="zoneForm.name" class="field" placeholder="Zone name" required />
          <button class="btn-primary" type="submit">Add zone</button>
        </form>
        <form class="panel space-y-3 p-4" @submit.prevent="createBin">
          <h3 class="font-semibold">Bin</h3>
          <select v-model="binForm.zoneId" class="field" required>
            <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.code }}</option>
          </select>
          <input v-model="binForm.code" class="field font-mono" placeholder="Bin code" required />
          <input v-model="binForm.barcode" class="field font-mono" placeholder="Barcode" />
          <button class="btn-primary" type="submit">Add bin</button>
        </form>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="table-wrap panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>WH</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in warehouses" :key="w.id">
                <td class="mono">{{ w.code }}</td>
                <td>{{ w.name }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-wrap panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Bin</th>
                <th>Barcode</th>
                <th>Zone</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in bins" :key="b.id">
                <td class="mono">{{ b.code }}</td>
                <td class="mono">{{ b.barcode || '—' }}</td>
                <td class="mono">
                  {{ zones.find((z) => z.id === b.zoneId)?.code || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div class="space-y-4">
        <form class="panel grid gap-3 p-4 md:grid-cols-2" @submit.prevent="createSku">
          <h3 class="font-semibold md:col-span-2">New SKU</h3>
          <input v-model="skuForm.code" class="field font-mono" placeholder="SKU code" required />
          <input v-model="skuForm.name" class="field" placeholder="Name" required />
          <input v-model="skuForm.uom" class="field" placeholder="UOM" />
          <input v-model="skuForm.barcode" class="field font-mono" placeholder="Barcode" />
          <button class="btn-primary md:col-span-2" type="submit">Create SKU</button>
        </form>
        <div class="table-wrap panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>UOM</th>
                <th>Barcode</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in skus" :key="s.id">
                <td class="mono text-dock-300">{{ s.code }}</td>
                <td>{{ s.name }}</td>
                <td>{{ s.uom }}</td>
                <td class="mono">{{ s.barcode || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel p-4">
        <h3 class="font-semibold">Barcode preview</h3>
        <p class="mt-1 text-xs text-slate-500">Uses Code 128-style text preview for scanners.</p>
        <div
          class="mt-4 rounded-lg border border-dashed border-white/20 bg-white px-3 py-6 text-center text-ink-950"
        >
          <p class="font-display text-xl font-bold">
            {{ skus[0]?.name || 'SKU' }}
          </p>
          <p
            class="mt-3 font-mono text-3xl tracking-[0.35em]"
            style="font-family: 'Libre Barcode 128 Text monospace"
          >
            {{ skus[0]?.barcode || skus[0]?.code || 'SAMPLE' }}
          </p>
          <p class="mono mt-2 text-sm">{{ skus[0]?.barcode || skus[0]?.code || '—' }}</p>
        </div>
        <p class="mt-3 text-xs text-slate-500">
          Tip: wireless scanners type into Lot# / barcode fields like a keyboard.
        </p>
        <p v-if="selectedSku" class="sr-only">{{ selectedSku.code }}</p>
      </div>
    </div>
  </div>
</template>
