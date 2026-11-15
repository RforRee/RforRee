<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { downloadBlob, outboundApi, skusApi } from '@/api/client'
import type { OutboundOrder, Sku } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const orders = ref<OutboundOrder[]>([])
const skus = ref<Sku[]>([])
const message = ref('')
const error = ref('')
const busy = ref(false)
const sourceFilter = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const scan = ref('')

const createForm = ref({
  orderNumber: '',
  skuId: '',
  requestedQty: 1,
  lotNumber: '',
})

function progress(o: OutboundOrder) {
  const req = o.lines.reduce((s, l) => s + Number(l.requestedQty), 0)
  const shipped = o.lines.reduce((s, l) => s + Number(l.shippedQty), 0)
  return { req, shipped, pct: req > 0 ? Math.round((shipped / req) * 100) : 0 }
}

async function refresh() {
  const clientId = session.client?.id
  const warehouseId = session.warehouse?.id
  const [ord, skuList] = await Promise.all([
    outboundApi.list({
      clientId,
      warehouseId,
      source: sourceFilter.value || undefined,
    }),
    skusApi.list(clientId),
  ])
  orders.value = ord.data
  skus.value = skuList.data
  if (!createForm.value.skuId && skuList.data[0]) {
    createForm.value.skuId = skuList.data[0].id
  }
}

async function createOrder() {
  if (!session.client || !session.warehouse) {
    error.value = 'Select a warehouse at login to create ship orders.'
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
      source: 'MANUAL',
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
    router.push({ name: 'outbound-detail', params: { id: data.id } })
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function downloadTemplate() {
  const { data } = await outboundApi.downloadTemplate()
  downloadBlob(data, 'outbound-order-template.xlsx')
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !session.client) return
  busy.value = true
  error.value = ''
  try {
    const { data } = await outboundApi.importExcel(session.client.id, file)
    message.value =
      `Imported ${data.createdCount} order(s)` +
      (data.errorCount ? `, ${data.errorCount} failed` : '')
    if (data.errors.length) {
      error.value = data.errors
        .map((e) => `${e.orderNumber}: ${e.error}`)
        .join('; ')
    }
    await refresh()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
    input.value = ''
  }
}

function onScan() {
  const code = scan.value.trim()
  if (!code) return
  const sku = skus.value.find((s) => s.barcode === code || s.code === code)
  if (sku) {
    createForm.value.skuId = sku.id
    message.value = `SKU scanned: ${sku.code}`
  } else {
    error.value = `No SKU for scan: ${code}`
  }
  scan.value = ''
}

function extractError(e: unknown) {
  if (typeof e === 'object' && e && 'response' in e) {
    const resp = (e as { response?: { data?: { error?: string } } }).response
    return resp?.data?.error || 'Request failed'
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
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-3xl font-semibold uppercase text-white">Outbound</h2>
        <p class="text-sm text-slate-400">
          Manual create, Excel import, or API orders — open a row for pick/ship progress.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" type="button" @click="downloadTemplate">
          Excel template
        </button>
        <button class="btn-primary" type="button" :disabled="busy" @click="fileInput?.click()">
          Import Excel
        </button>
        <input
          ref="fileInput"
          class="hidden"
          type="file"
          accept=".xlsx,.xls"
          @change="onImportFile"
        />
      </div>
    </div>

    <p v-if="message" class="text-sm text-bay-400">{{ message }}</p>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="grid gap-4 xl:grid-cols-[340px_1fr]">
      <form class="panel space-y-3 p-4" @submit.prevent="createOrder">
        <h3 class="font-semibold">Quick create order</h3>
        <input
          v-model="scan"
          class="field font-mono"
          placeholder="Scan SKU then Enter"
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
        <button class="btn-primary w-full" type="submit" :disabled="busy">Create &amp; open</button>
      </form>

      <div class="space-y-3">
        <div class="flex items-center gap-3">
          <label class="text-sm text-slate-400">
            Source
            <select v-model="sourceFilter" class="field mt-1 w-40" @change="refresh">
              <option value="">All</option>
              <option value="MANUAL">Manual</option>
              <option value="IMPORT">Excel import</option>
              <option value="API">API / EDI</option>
            </select>
          </label>
          <button class="btn-secondary mt-5" type="button" @click="refresh">Refresh</button>
        </div>

        <div class="table-wrap panel">
          <table class="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Source</th>
                <th>Status</th>
                <th>Progress</th>
                <th>WH</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in orders"
                :key="o.id"
                class="cursor-pointer"
                @click="router.push({ name: 'outbound-detail', params: { id: o.id } })"
              >
                <td class="mono text-dock-300">{{ o.orderNumber }}</td>
                <td>
                  <span class="badge bg-white/10">{{ o.source || 'MANUAL' }}</span>
                </td>
                <td>
                  <span class="badge bg-white/10">{{ o.status }}</span>
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-24 overflow-hidden rounded bg-ink-800">
                      <div
                        class="h-full bg-sky-400"
                        :style="{ width: `${progress(o).pct}%` }"
                      />
                    </div>
                    <span class="mono text-xs">
                      {{ progress(o).shipped }}/{{ progress(o).req }}
                    </span>
                  </div>
                </td>
                <td class="mono">{{ o.warehouse?.code || '—' }}</td>
              </tr>
              <tr v-if="!orders.length">
                <td colspan="5" class="text-slate-500">No outbound orders</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
