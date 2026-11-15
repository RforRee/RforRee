<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { outboundApi, skusApi } from '@/api/client'
import type { OutboundOrderDetail, Sku } from '@/api/types'

const route = useRoute()
const router = useRouter()
const detail = ref<OutboundOrderDetail | null>(null)
const skus = ref<Sku[]>([])
const message = ref('')
const error = ref('')
const busy = ref(false)
const autoRefresh = ref(true)
const shipQty = ref<number | null>(null)
const notes = ref('')
let timer: ReturnType<typeof setInterval> | null = null

const draftLines = ref<
  Array<{
    id?: string
    skuId: string
    requestedQty: number
    lotNumber: string
    shippedQty: number
  }>
>([])

const order = computed(() => detail.value?.order)
const editable = computed(
  () => order.value && !['SHIPPED', 'CANCELLED'].includes(order.value.status),
)

async function load() {
  const id = String(route.params.id)
  const { data } = await outboundApi.get(id)
  detail.value = data
  notes.value = data.order.notes || ''
  draftLines.value = data.order.lines.map((l) => ({
    id: l.id,
    skuId: l.skuId,
    requestedQty: Number(l.requestedQty),
    lotNumber: l.lotNumber || '',
    shippedQty: Number(l.shippedQty),
  }))
  const { data: skuList } = await skusApi.list(data.order.clientId)
  skus.value = skuList
}

async function saveEdits() {
  if (!order.value || !editable.value) return
  busy.value = true
  error.value = ''
  try {
    await outboundApi.update(order.value.id, {
      notes: notes.value || null,
      lines: draftLines.value.map((l) => ({
        id: l.id,
        skuId: l.id ? undefined : l.skuId,
        requestedQty: l.requestedQty,
        lotNumber: l.lotNumber || null,
      })),
    })
    message.value = 'Order saved'
    await load()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function ship(partial: boolean) {
  if (!order.value) return
  busy.value = true
  error.value = ''
  try {
    const body =
      partial && order.value.lines[0] && shipQty.value
        ? { lines: [{ lineId: order.value.lines[0].id, quantity: shipQty.value }] }
        : {}
    const { data } = await outboundApi.ship(order.value.id, body)
    message.value = `Ship OK — ${data.order.status}`
    await load()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

function addLine() {
  if (!skus.value[0]) return
  draftLines.value.push({
    skuId: skus.value[0].id,
    requestedQty: 1,
    lotNumber: '',
    shippedQty: 0,
  })
}

async function removeLine(idx: number) {
  const line = draftLines.value[idx]
  if (!line.id) {
    draftLines.value.splice(idx, 1)
    return
  }
  if (line.shippedQty > 0) {
    error.value = 'Cannot remove a line with shipments'
    return
  }
  if (!order.value) return
  busy.value = true
  try {
    await outboundApi.update(order.value.id, {
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
        <button
          class="text-sm text-slate-400 hover:text-dock-300"
          type="button"
          @click="router.push('/outbound')"
        >
          ← Back to outbound
        </button>
        <h2 class="mt-1 font-display text-3xl font-semibold uppercase text-white">
          {{ order.orderNumber }}
        </h2>
        <p class="mt-1 flex flex-wrap gap-2 text-sm text-slate-400">
          <span class="badge bg-white/10">{{ order.status }}</span>
          <span class="badge bg-dock-400/20 text-dock-300">{{ order.source || 'MANUAL' }}</span>
          <span class="mono">{{ order.warehouse?.code }}</span>
        </p>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-400">
        <input v-model="autoRefresh" type="checkbox" class="rounded border-white/20 bg-ink-900" />
        Live refresh (handheld pick/ship)
      </label>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="panel p-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs uppercase tracking-wide text-slate-500">Pick / ship progress</p>
          <p class="font-display text-3xl font-bold text-sky-300">
            {{ detail?.progress.percent ?? 0 }}%
          </p>
          <p class="mono text-sm text-slate-400">
            {{ detail?.progress.shippedQty }} / {{ detail?.progress.requestedQty }} ·
            {{ detail?.progress.completedLines }}/{{ detail?.progress.lineCount }} lines
          </p>
        </div>
        <div class="h-3 w-full max-w-md overflow-hidden rounded-full bg-ink-800 sm:w-80">
          <div
            class="h-full bg-sky-400 transition-all"
            :style="{ width: `${detail?.progress.percent ?? 0}%` }"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="panel space-y-3 p-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Lines (editable)</h3>
          <button v-if="editable" class="btn-secondary" type="button" @click="addLine">
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
                v-model.number="l.requestedQty"
                class="field"
                type="number"
                min="0"
                :disabled="!editable"
              />
              <input
                v-model="l.lotNumber"
                class="field font-mono md:col-span-2"
                placeholder="Lot preference"
                :disabled="!editable"
              />
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>Shipped: {{ l.shippedQty }}</span>
              <button
                v-if="editable && l.shippedQty === 0"
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
        <h3 class="font-semibold">Desktop ship (FIFO by ED)</h3>
        <div class="grid grid-cols-2 gap-3">
          <input
            v-model.number="shipQty"
            class="field"
            type="number"
            min="1"
            placeholder="Partial qty"
            :disabled="!editable"
          />
          <button
            class="btn-secondary"
            type="button"
            :disabled="busy || !editable"
            @click="ship(true)"
          >
            Ship partial
          </button>
        </div>
        <button
          class="btn-success w-full"
          type="button"
          :disabled="busy || !editable"
          @click="ship(false)"
        >
          Confirm ship remaining
        </button>
      </section>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="panel p-4">
        <h3 class="mb-3 font-semibold">Handheld pick / ship activity</h3>
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
                <td colspan="4" class="text-slate-500">No handheld sync for this order yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel p-4">
        <h3 class="mb-3 font-semibold">Inventory ledger (this order)</h3>
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
                <td class="tabular-nums text-rose-300">{{ t.quantity }}</td>
              </tr>
              <tr v-if="!(detail?.transactions?.length)">
                <td colspan="4" class="text-slate-500">No ship transactions yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
  <p v-else class="text-slate-400">Loading order…</p>
</template>
