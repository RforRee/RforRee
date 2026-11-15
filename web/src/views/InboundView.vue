<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { downloadBlob, inboundApi, skusApi } from '@/api/client'
import type { InboundOrder, Sku } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const orders = ref<InboundOrder[]>([])
const skus = ref<Sku[]>([])
const message = ref('')
const error = ref('')
const busy = ref(false)
const sourceFilter = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const createForm = ref({
  asnNumber: '',
  skuId: '',
  expectedQty: 10,
  lotNumber: '',
  expiryDate: '',
})

function progress(o: InboundOrder) {
  const exp = o.lines.reduce((s, l) => s + Number(l.expectedQty), 0)
  const rec = o.lines.reduce((s, l) => s + Number(l.receivedQty), 0)
  return { exp, rec, pct: exp > 0 ? Math.round((rec / exp) * 100) : 0 }
}

async function refresh() {
  const clientId = session.client?.id
  const warehouseId = session.warehouse?.id
  const [ord, skuList] = await Promise.all([
    inboundApi.list({
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

async function createAsn() {
  if (!session.client || !session.warehouse) {
    error.value = 'Select a warehouse at login to create ASN.'
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
      source: 'MANUAL',
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
    router.push({ name: 'inbound-detail', params: { id: data.id } })
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
  }
}

async function downloadTemplate() {
  const { data } = await inboundApi.downloadTemplate()
  downloadBlob(data, 'inbound-order-template.xlsx')
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !session.client) return
  busy.value = true
  error.value = ''
  try {
    const { data } = await inboundApi.importExcel(session.client.id, file)
    message.value = `Imported ${data.createdCount} ASN(s)` +
      (data.errorCount ? `, ${data.errorCount} failed` : '')
    if (data.errors.length) {
      error.value = data.errors.map((e) => `${e.asnNumber}: ${e.error}`).join('; ')
    }
    await refresh()
  } catch (e: unknown) {
    error.value = extractError(e)
  } finally {
    busy.value = false
    input.value = ''
  }
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
        <h2 class="font-display text-3xl font-semibold uppercase text-white">Inbound</h2>
        <p class="text-sm text-slate-400">
          Create manually, import Excel, or receive API/EDI orders — click a row to manage.
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
      <form class="panel space-y-3 p-4" @submit.prevent="createAsn">
        <h3 class="font-semibold">Quick create ASN</h3>
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
            required
          />
          <input v-model="createForm.lotNumber" class="field font-mono" placeholder="Lot#" />
        </div>
        <input v-model="createForm.expiryDate" class="field" type="date" />
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
                <th>ASN</th>
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
                @click="router.push({ name: 'inbound-detail', params: { id: o.id } })"
              >
                <td class="mono text-dock-300">{{ o.asnNumber }}</td>
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
                        class="h-full bg-bay-500"
                        :style="{ width: `${progress(o).pct}%` }"
                      />
                    </div>
                    <span class="mono text-xs">
                      {{ progress(o).rec }}/{{ progress(o).exp }}
                    </span>
                  </div>
                </td>
                <td class="mono">{{ o.warehouse?.code || '—' }}</td>
              </tr>
              <tr v-if="!orders.length">
                <td colspan="5" class="text-slate-500">No inbound orders</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-slate-500">
          Tip: API-created ASNs (source=API) appear here automatically after ERP push.
        </p>
      </div>
    </div>
  </div>
</template>
