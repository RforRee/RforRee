<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { inboundApi, inventoryApi, outboundApi } from '@/api/client'
import type { InboundOrder, InventoryBalance, OutboundOrder } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const loading = ref(true)
const error = ref('')
const balances = ref<InventoryBalance[]>([])
const inbound = ref<InboundOrder[]>([])
const outbound = ref<OutboundOrder[]>([])

const totalQty = computed(() =>
  balances.value.reduce((sum, b) => sum + Number(b.quantity || 0), 0),
)
const openInbound = computed(() =>
  inbound.value.filter((o) => ['OPEN', 'RECEIVING', 'DRAFT'].includes(o.status)),
)
const openOutbound = computed(() =>
  outbound.value.filter((o) => ['OPEN', 'SHIPPING', 'DRAFT'].includes(o.status)),
)

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const clientId = session.client?.id
    const warehouseId = session.warehouse?.id
    const [bal, inn, out] = await Promise.all([
      inventoryApi.balances({ clientId, warehouseId }),
      inboundApi.list({ clientId, warehouseId }),
      outboundApi.list({ clientId, warehouseId }),
    ])
    balances.value = bal.data
    inbound.value = inn.data
    outbound.value = out.data
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-3xl font-semibold uppercase text-white">Floor overview</h2>
        <p class="text-sm text-slate-400">Live balances and open dock documents.</p>
      </div>
      <button class="btn-secondary" type="button" :disabled="loading" @click="refresh">
        Refresh
      </button>
    </div>

    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="panel p-5">
        <p class="text-xs uppercase tracking-wide text-slate-500">On-hand qty</p>
        <p class="mt-2 font-display text-4xl font-bold text-dock-300">
          {{ totalQty.toLocaleString() }}
        </p>
        <p class="mt-1 text-sm text-slate-400">{{ balances.length }} balance rows</p>
      </div>
      <div class="panel p-5">
        <p class="text-xs uppercase tracking-wide text-slate-500">Open inbound</p>
        <p class="mt-2 font-display text-4xl font-bold text-bay-400">{{ openInbound.length }}</p>
        <p class="mt-1 text-sm text-slate-400">ASN / receiving</p>
      </div>
      <div class="panel p-5">
        <p class="text-xs uppercase tracking-wide text-slate-500">Open outbound</p>
        <p class="mt-2 font-display text-4xl font-bold text-sky-300">{{ openOutbound.length }}</p>
        <p class="mt-1 text-sm text-slate-400">Pick / ship</p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="panel p-4">
        <h3 class="mb-3 font-semibold text-slate-100">Inbound status</h3>
        <div class="table-wrap max-h-80">
          <table class="data-table">
            <thead>
              <tr>
                <th>ASN</th>
                <th>Status</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in inbound.slice(0, 12)" :key="o.id">
                <td class="mono">{{ o.asnNumber }}</td>
                <td>
                  <span class="badge bg-white/10">{{ o.status }}</span>
                </td>
                <td>{{ o.lines?.length ?? 0 }}</td>
              </tr>
              <tr v-if="!inbound.length">
                <td colspan="3" class="text-slate-500">No inbound orders</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel p-4">
        <h3 class="mb-3 font-semibold text-slate-100">Outbound status</h3>
        <div class="table-wrap max-h-80">
          <table class="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in outbound.slice(0, 12)" :key="o.id">
                <td class="mono">{{ o.orderNumber }}</td>
                <td>
                  <span class="badge bg-white/10">{{ o.status }}</span>
                </td>
                <td>{{ o.lines?.length ?? 0 }}</td>
              </tr>
              <tr v-if="!outbound.length">
                <td colspan="3" class="text-slate-500">No outbound orders</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
