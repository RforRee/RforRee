<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { binsApi, inboundApi, skusApi, zonesApi } from '@/api/client'
import type { Bin, InboundOrder, Sku } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const orders = ref<InboundOrder[]>([])
const skus = ref<Sku[]>([])
const bins = ref<Bin[]>([])
const selectedId = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)

const createForm = ref({
  asnNumber: '',
  skuId: '',
  expectedQty: 10,
  lotNumber: '',
  expiryDate: '',
})

const receiveForm = ref({
  lineId: '',
  binId: '',
  quantity: 1,
  scan: '',
})

const selected = computed(() => orders.value.find((o) => o.id === selectedId.value) || null)
const skuMap = computed(() => new Map(skus.value.map((s) => [s.id, s])))

async function loadBins() {
  bins.value = []
  const whId = session.warehouse?.id
  if (!whId) return
  const { data: zones } = await zonesApi.list(whId)
  for (const z of zones) {
    const { data } = await binsApi.list(z.id)
    bins.value.push(...data)
  }
  if (!receiveForm.value.binId && bins.value[0]) {
    receiveForm.value.binId = bins.value[0].id
  }
}

async function refresh() {
  const clientId = session.client?.id
  const warehouseId = session.warehouse?.id
  const [ord, skuList] = await Promise.all([
    inboundApi.list({ clientId, warehouseId }),
    skusApi.list(clientId),
  ])
  orders.value = ord.data
  skus.value = skuList.data
  if (!selectedId.value && ord.data[0]) selectedId.value = ord.data[0].id
  if (!createForm.value.skuId && skuList.data[0]) createForm.value.skuId = skuList.data[0].id
  if (selected.value?.lines[0]) receiveForm.value.lineId = selected.value.lines[0].id
  await loadBins()
}

async function createAsn() {
  if (!session.client || !session.warehouse) {
    error.value = 'Login with a warehouse selected to create ASN.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const { data } = await inboundApi.create({
      clientId: session.client.id,
      warehouseId: session.warehouse.id,
      asnNumber: createForm.value.asnNumber,
      status: 'OPEN',
      lines: [
        {
          skuId: createForm.value.skuId,
          expectedQty: createForm.value.expectedQty,
          lotNumber: createForm.value.lotNumber || '',
          expiryDate: createForm.value.expiryDate || null,
        },
      ],
    })
    message.value = `ASN ${data.asnNumber} created`
    createForm.value.asnNumber = ''
    await refresh()
    selectedId.value = data.id
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function receive() {
  if (!selected.value) return
  busy.value = true
  error.value = ''
  try {
    await inboundApi.receive(selected.value.id, {
      asnNumber: selected.value.asnNumber,
      lines: [
        {
          lineId: receiveForm.value.lineId,
          binId: receiveForm.value.binId,
          quantity: receiveForm.value.quantity,
        },
      ],
    })
    message.value = `Received ${receiveForm.value.quantity} onto bin`
    await refresh()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

function onScan() {
  const code = receiveForm.value.scan.trim()
  if (!code) return
  const bin = bins.value.find((b) => b.barcode === code || b.code === code)
  if (bin) {
    receiveForm.value.binId = bin.id
    message.value = `Bin scanned: ${bin.code}`
  } else {
    const sku = skus.value.find((s) => s.barcode === code || s.code === code)
    if (sku && selected.value) {
      const line = selected.value.lines.find((l) => l.skuId === sku.id)
      if (line) {
        receiveForm.value.lineId = line.id
        message.value = `SKU scanned: ${sku.code}`
      }
    } else {
      error.value = `No bin/SKU match for scan: ${code}`
    }
  }
  receiveForm.value.scan = ''
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
      <h2 class="font-display text-3xl font-semibold uppercase text-white">Inbound</h2>
      <p class="text-sm text-slate-400">Create ASN, scan put-away bin, confirm receive.</p>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="grid gap-4 xl:grid-cols-2">
      <form class="panel space-y-3 p-4" @submit.prevent="createAsn">
        <h3 class="font-semibold">New ASN</h3>
        <input
          v-model="createForm.asnNumber"
          class="field font-mono"
          placeholder="ASN number"
          required
        />
        <select v-model="createForm.skuId" class="field" required>
          <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.code }} — {{ s.name }}</option>
        </select>
        <div class="grid grid-cols-2 gap-3">
          <input
            v-model.number="createForm.expectedQty"
            class="field"
            type="number"
            min="1"
            step="1"
            required
          />
          <input
            v-model="createForm.lotNumber"
            class="field font-mono"
            placeholder="Lot#"
          />
        </div>
        <input v-model="createForm.expiryDate" class="field" type="date" />
        <button class="btn-primary w-full" type="submit" :disabled="busy">Create ASN</button>
      </form>

      <form class="panel space-y-3 p-4" @submit.prevent="receive">
        <h3 class="font-semibold">Receive &amp; put-away</h3>
        <select v-model="selectedId" class="field" @change="receiveForm.lineId = selected?.lines[0]?.id || ''">
          <option v-for="o in orders" :key="o.id" :value="o.id">
            {{ o.asnNumber }} ({{ o.status }})
          </option>
        </select>

        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Barcode scan (SKU or Bin)</span>
          <input
            v-model="receiveForm.scan"
            class="field font-mono"
            placeholder="Scan here then Enter"
            @keyup.enter.prevent="onScan"
          />
        </label>

        <select v-model="receiveForm.lineId" class="field" required>
          <option v-for="l in selected?.lines || []" :key="l.id" :value="l.id">
            {{ skuMap.get(l.skuId)?.code }} — rem
            {{ Number(l.expectedQty) - Number(l.receivedQty) }}
          </option>
        </select>
        <select v-model="receiveForm.binId" class="field" required>
          <option v-for="b in bins" :key="b.id" :value="b.id">
            {{ b.code }}{{ b.barcode ? ` / ${b.barcode}` : '' }}
          </option>
        </select>
        <input
          v-model.number="receiveForm.quantity"
          class="field"
          type="number"
          min="1"
          step="1"
          required
        />
        <button class="btn-success w-full" type="submit" :disabled="busy || !selected">
          Confirm receive
        </button>
      </form>
    </div>

    <div class="table-wrap panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>ASN</th>
            <th>Status</th>
            <th>SKU</th>
            <th>Expected</th>
            <th>Received</th>
            <th>Lot / ED</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="o in orders" :key="o.id">
            <tr v-for="l in o.lines" :key="l.id">
              <td class="mono">{{ o.asnNumber }}</td>
              <td><span class="badge bg-white/10">{{ o.status }}</span></td>
              <td class="mono">{{ skuMap.get(l.skuId)?.code }}</td>
              <td>{{ l.expectedQty }}</td>
              <td>{{ l.receivedQty }}</td>
              <td class="mono text-xs">
                {{ l.lotNumber || '—' }} /
                {{ l.expiryDate ? String(l.expiryDate).slice(0, 10) : '—' }}
              </td>
            </tr>
          </template>
          <tr v-if="!orders.length">
            <td colspan="6" class="text-slate-500">No inbound orders</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
