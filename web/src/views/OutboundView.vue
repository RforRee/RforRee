<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { outboundApi, skusApi } from '@/api/client'
import type { OutboundOrder, Sku } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const orders = ref<OutboundOrder[]>([])
const skus = ref<Sku[]>([])
const selectedId = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)
const scan = ref('')

const createForm = ref({
  orderNumber: '',
  skuId: '',
  requestedQty: 1,
  lotNumber: '',
})

const shipQty = ref<number | null>(null)

const selected = computed(() => orders.value.find((o) => o.id === selectedId.value) || null)
const skuMap = computed(() => new Map(skus.value.map((s) => [s.id, s])))

async function refresh() {
  const clientId = session.client?.id
  const warehouseId = session.warehouse?.id
  const [ord, skuList] = await Promise.all([
    outboundApi.list({ clientId, warehouseId }),
    skusApi.list(clientId),
  ])
  orders.value = ord.data
  skus.value = skuList.data
  if (!selectedId.value && ord.data[0]) selectedId.value = ord.data[0].id
  if (!createForm.value.skuId && skuList.data[0]) createForm.value.skuId = skuList.data[0].id
}

async function createOrder() {
  if (!session.client || !session.warehouse) {
    error.value = 'Login with a warehouse selected to create ship orders.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const { data } = await outboundApi.create({
      clientId: session.client.id,
      warehouseId: session.warehouse.id,
      orderNumber: createForm.value.orderNumber,
      status: 'OPEN',
      lines: [
        {
          skuId: createForm.value.skuId,
          requestedQty: createForm.value.requestedQty,
          lotNumber: createForm.value.lotNumber || null,
        },
      ],
    })
    message.value = `Order ${data.orderNumber} created`
    createForm.value.orderNumber = ''
    await refresh()
    selectedId.value = data.id
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function ship(partial = false) {
  if (!selected.value) return
  busy.value = true
  error.value = ''
  try {
    const body =
      partial && selected.value.lines[0] && shipQty.value
        ? {
            lines: [
              {
                lineId: selected.value.lines[0].id,
                quantity: shipQty.value,
              },
            ],
          }
        : {}
    const { data } = await outboundApi.ship(selected.value.id, body)
    message.value = `Shipped — status ${data.order.status}`
    await refresh()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

function onScan() {
  const code = scan.value.trim()
  if (!code) return
  const sku = skus.value.find((s) => s.barcode === code || s.code === code)
  if (sku) {
    createForm.value.skuId = sku.id
    message.value = `Picked SKU scan: ${sku.code}`
  } else {
    error.value = `No SKU for scan: ${code}`
  }
  scan.value = ''
}

function extractError(e: unknown) {
  if (typeof e === 'object' && e && 'response' in e) {
    const resp = (e as { response?: { data?: { error?: string; message?: string } } }).response
    return resp?.data?.error || resp?.data?.message || 'Request failed'
  }
  return e instanceof Error ? e.message : 'Request failed'
}

onMounted(async () => {
  try {
    await refresh()
  } catch (e) {
    error.value = extractError(e)
  }
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h2 class="font-display text-3xl font-semibold uppercase text-white">Outbound</h2>
      <p class="text-sm text-slate-400">
        Create ship orders, scan SKU for pick confirmation, ship with FIFO deduction.
      </p>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="grid gap-4 xl:grid-cols-2">
      <form class="panel space-y-3 p-4" @submit.prevent="createOrder">
        <h3 class="font-semibold">New ship order</h3>
        <input
          v-model="scan"
          class="field font-mono"
          placeholder="Scan SKU barcode then Enter"
          @keyup.enter.prevent="onScan"
        />
        <input
          v-model="createForm.orderNumber"
          class="field font-mono"
          placeholder="Order number"
          required
        />
        <select v-model="createForm.skuId" class="field" required>
          <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.code }} — {{ s.name }}</option>
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            v-model.number="createForm.requestedQty"
            class="field"
            type="number"
            min="1"
            required
          />
          <input v-model="createForm.lotNumber" class="field font-mono" placeholder="Lot pref." />
        </div>
        <button class="btn-primary w-full" type="submit" :disabled="busy">Create order</button>
      </form>

      <div class="panel space-y-3 p-4">
        <h3 class="font-semibold">Pick &amp; ship</h3>
        <select v-model="selectedId" class="field">
          <option v-for="o in orders" :key="o.id" :value="o.id">
            {{ o.orderNumber }} ({{ o.status }})
          </option>
        </select>

        <div v-if="selected" class="rounded-lg border border-white/10 bg-ink-950/50 p-3 text-sm">
          <p>
            Lines:
            <span v-for="l in selected.lines" :key="l.id" class="mono ml-2">
              {{ skuMap.get(l.skuId)?.code }} {{ l.shippedQty }}/{{ l.requestedQty }}
            </span>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <input
            v-model.number="shipQty"
            class="field"
            type="number"
            min="1"
            placeholder="Partial qty"
          />
          <button class="btn-secondary" type="button" :disabled="busy || !selected" @click="ship(true)">
            Ship partial
          </button>
        </div>
        <button class="btn-success w-full" type="button" :disabled="busy || !selected" @click="ship(false)">
          Confirm ship remaining (FIFO by ED)
        </button>
      </div>
    </div>

    <div class="table-wrap panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>SKU</th>
            <th>Requested</th>
            <th>Shipped</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="o in orders" :key="o.id">
            <tr v-for="l in o.lines" :key="l.id">
              <td class="mono">{{ o.orderNumber }}</td>
              <td><span class="badge bg-white/10">{{ o.status }}</span></td>
              <td class="mono">{{ skuMap.get(l.skuId)?.code }}</td>
              <td>{{ l.requestedQty }}</td>
              <td>{{ l.shippedQty }}</td>
            </tr>
          </template>
          <tr v-if="!orders.length">
            <td colspan="5" class="text-slate-500">No outbound orders</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
