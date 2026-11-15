<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { binsApi, inboundApi, skusApi, zonesApi } from '@/api/client'
import type { Bin, InboundOrderDetail, Sku } from '@/api/types'

const route = useRoute()
const router = useRouter()
const detail = ref<InboundOrderDetail | null>(null)
const bins = ref<Bin[]>([])
const skus = ref<Sku[]>([])
const message = ref('')
const error = ref('')
const busy = ref(false)
const autoRefresh = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const notes = ref('')
const receive = ref({ lineId: '', binId: '', quantity: 1, scan: '' })
const draftLines = ref<
  Array<{
    id?: string
    skuId: string
    expectedQty: number
    lotNumber: string
    expiryDate: string
    manufactureDate: string
    receivedQty: number
  }>
>([])

const order = computed(() => detail.value?.order)
const editable = computed(
  () => order.value && !['COMPLETED', 'CANCELLED'].includes(order.value.status),
)

async function load() {
  const id = String(route.params.id)
  const { data } = await inboundApi.get(id)
  detail.value = data
  notes.value = data.order.notes || ''
  draftLines.value = data.order.lines.map((l) => ({
    id: l.id,
    skuId: l.skuId,
    expectedQty: Number(l.expectedQty),
    lotNumber: l.lotNumber || '',
    expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : '',
    manufactureDate: l.manufactureDate
      ? String(l.manufactureDate).slice(0, 10)
      : '',
    receivedQty: Number(l.receivedQty),
  }))
  if (!receive.value.lineId && data.order.lines[0]) {
    receive.value.lineId = data.order.lines[0].id
  }
  const { data: skuList } = await skusApi.list(data.order.clientId)
  skus.value = skuList
  await loadBins(data.order.warehouseId)
}

async function loadBins(warehouseId: string) {
  const { data: zones } = await zonesApi.list(warehouseId)
  const all: Bin[] = []
  for (const z of zones) {
    const { data } = await binsApi.list(z.id)
    all.push(...data)
  }
  bins.value = all
  if (!receive.value.binId && all[0]) receive.value.binId = all[0].id
}

async function saveEdits() {
  if (!order.value || !editable.value) return
  busy.value = true
  error.value = ''
  try {
    const { data } = await inboundApi.update(order.value.id, {
      notes: notes.value || null,
      lines: draftLines.value.map((l) => ({
        id: l.id,
        skuId: l.id ? undefined : l.skuId,
        expectedQty: l.expectedQty,
        lotNumber: l.lotNumber,
        expiryDate: l.expiryDate || null,
        manufactureDate: l.manufactureDate || null,
      })),
    })
    detail.value = data
    message.value = 'Order saved'
    await load()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function doReceive() {
  if (!order.value) return
  busy.value = true
  error.value = ''
  try {
    await inboundApi.receive(order.value.id, {
      asnNumber: order.value.asnNumber,
      lines: [
        {
          lineId: receive.value.lineId,
          binId: receive.value.binId,
          quantity: receive.value.quantity,
        },
      ],
    })
    message.value = `Received ${receive.value.quantity}`
    await load()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

function onScan() {
  const code = receive.value.scan.trim()
  if (!code || !order.value) return
  const bin = bins.value.find((b) => b.barcode === code || b.code === code)
  if (bin) {
    receive.value.binId = bin.id
    message.value = `Bin: ${bin.code}`
  } else {
    const sku = skus.value.find((s) => s.barcode === code || s.code === code)
    const line = order.value.lines.find((l) => l.skuId === sku?.id)
    if (line) {
      receive.value.lineId = line.id
      message.value = `SKU line: ${sku?.code}`
    } else {
      error.value = `No match for ${code}`
    }
  }
  receive.value.scan = ''
}

function addLine() {
  if (!skus.value[0]) return
  draftLines.value.push({
    skuId: skus.value[0].id,
    expectedQty: 1,
    lotNumber: '',
    expiryDate: '',
    manufactureDate: '',
    receivedQty: 0,
  })
}

async function removeLine(idx: number) {
  const line = draftLines.value[idx]
  if (!line.id) {
    draftLines.value.splice(idx, 1)
    return
  }
  if (line.receivedQty > 0) {
    error.value = 'Cannot remove a line with receipts'
    return
  }
  if (!order.value) return
  busy.value = true
  try {
    await inboundApi.update(order.value.id, {
      lines: [{ id: line.id, _delete: true }],
    })
    message.value = 'Line removed'
    await load()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

function extractError(e: unknown) {
  if (typeof e === 'object' && e && 'response' in e) {
    const resp = (e as { response?: { data?: { error?: string } } }).response
    return resp?.data?.error || 'Request failed'
  }
  return e instanceof Error ? e.message : 'Request failed'
}

function startTimer() {
  stopTimer()
  if (!autoRefresh.value) return
  timer = setInterval(() => {
    void load().catch(() => undefined)
  }, 5000)
}
function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

watch(autoRefresh, startTimer)
onMounted(async () => {
  try {
    await load()
    startTimer()
  } catch (e) {
    error.value = extractError(e)
  }
})
onUnmounted(stopTimer)
</script>

<template>
  <div v-if="order" class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <button class="text-sm text-slate-400 hover:text-dock-300" type="button" @click="router.push('/inbound')">
          ← Back to inbound
        </button>
        <h2 class="mt-1 font-display text-3xl font-semibold uppercase text-white">
          ASN {{ order.asnNumber }}
        </h2>
        <p class="mt-1 flex flex-wrap gap-2 text-sm text-slate-400">
          <span class="badge bg-white/10">{{ order.status }}</span>
          <span class="badge bg-dock-400/20 text-dock-300">{{ order.source || 'MANUAL' }}</span>
          <span class="mono">{{ order.warehouse?.code }}</span>
          <span v-if="order.externalRef" class="mono">ext: {{ order.externalRef }}</span>
        </p>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-400">
        <input v-model="autoRefresh" type="checkbox" class="rounded border-white/20 bg-ink-900" />
        Live refresh (handheld)
      </label>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="panel p-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">Receive progress</p>
          <p class="font-display text-3xl font-bold text-bay-400">
            {{ detail?.progress.percent ?? 0 }}%
          </p>
          <p class="mono text-sm text-slate-400">
            {{ detail?.progress.receivedQty }} / {{ detail?.progress.expectedQty }} ·
            {{ detail?.progress.completedLines }}/{{ detail?.progress.lineCount }} lines
          </p>
        </div>
        <div class="h-3 w-full max-w-md overflow-hidden rounded-full bg-ink-800 sm:w-80">
          <div
            class="h-full bg-bay-500 transition-all"
            :style="{ width: `${detail?.progress.percent ?? 0}%` }"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="panel space-y-3 p-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Lines (editable)</h3>
          <button
            v-if="editable"
            class="btn-secondary"
            type="button"
            @click="addLine"
          >
            Add line
          </button>
        </div>
        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Notes</span>
          <textarea v-model="notes" class="field" rows="2" :disabled="!editable" />
        </label>
        <div class="space-y-3">
          <div
            v-for="(l, idx) in draftLines"
            :key="l.id || idx"
            class="rounded-lg border border-white/10 bg-ink-950/40 p-3"
          >
            <div class="grid gap-2 md:grid-cols-2">
              <select v-model="l.skuId" class="field" :disabled="!!l.id || !editable">
                <option v-for="s in skus" :key="s.id" :value="s.id">{{ s.code }}</option>
              </select>
              <input
                v-model.number="l.expectedQty"
                class="field"
                type="number"
                min="0"
                step="1"
                :disabled="!editable"
              />
              <input
                v-model="l.lotNumber"
                class="field font-mono"
                placeholder="Lot#"
                :disabled="!editable"
              />
              <input v-model="l.expiryDate" class="field" type="date" :disabled="!editable" />
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Received: {{ l.receivedQty }}</span>
              <button
                v-if="editable && l.receivedQty === 0"
                class="text-rose-300 hover:underline"
                type="button"
                @click="removeLine(idx)"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
        <button
          v-if="editable"
          class="btn-primary"
          type="button"
          :disabled="busy"
          @click="saveEdits"
        >
          Save changes
        </button>
      </section>

      <section class="panel space-y-3 p-4">
        <h3 class="font-semibold">Desktop receive / put-away</h3>
        <input
          v-model="receive.scan"
          class="field font-mono"
          placeholder="Scan SKU or Bin + Enter"
          :disabled="!editable"
          @keyup.enter.prevent="onScan"
        />
        <select v-model="receive.lineId" class="field" :disabled="!editable">
          <option v-for="l in order.lines" :key="l.id" :value="l.id">
            {{ l.sku?.code || l.skuId.slice(-6) }} — rem
            {{ Number(l.expectedQty) - Number(l.receivedQty) }}
          </option>
        </select>
        <select v-model="receive.binId" class="field" :disabled="!editable">
          <option v-for="b in bins" :key="b.id" :value="b.id">
            {{ b.code }}{{ b.barcode ? ` / ${b.barcode}` : '' }}
          </option>
        </select>
        <input
          v-model.number="receive.quantity"
          class="field"
          type="number"
          min="1"
          :disabled="!editable"
        />
        <button
          class="btn-success w-full"
          type="button"
          :disabled="busy || !editable"
          @click="doReceive"
        >
          Confirm receive
        </button>
      </section>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="panel p-4">
        <h3 class="mb-3 font-semibold">Handheld receive activity</h3>
        <div class="table-wrap max-h-72">
          <table class="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in detail?.handheldActivity || []" :key="a.id">
                <td class="mono text-xs">{{ new Date(a.createdAt).toLocaleString() }}</td>
                <td class="mono">{{ a.deviceId }}</td>
                <td><span class="badge bg-white/10">{{ a.status }}</span></td>
                <td class="text-xs">{{ a.message || a.conflictCode || '—' }}</td>
              </tr>
              <tr v-if="!(detail?.handheldActivity?.length)">
                <td colspan="4" class="text-slate-500">
                  No handheld sync pushes for this ASN yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel p-4">
        <h3 class="mb-3 font-semibold">Inventory ledger (this ASN)</h3>
        <div class="table-wrap max-h-72">
          <table class="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>SKU</th>
                <th>Bin</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in detail?.transactions || []" :key="t.id">
                <td class="mono text-xs">{{ new Date(t.createdAt).toLocaleString() }}</td>
                <td class="mono">{{ t.sku?.code }}</td>
                <td class="mono">{{ t.bin?.code }}</td>
                <td class="tabular-nums text-bay-400">{{ t.quantity }}</td>
              </tr>
              <tr v-if="!(detail?.transactions?.length)">
                <td colspan="4" class="text-slate-500">No put-away transactions yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
  <p v-else class="text-slate-400">Loading order…</p>
</template>
