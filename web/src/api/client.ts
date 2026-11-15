import axios from 'axios'
import type {
  Bin,
  Client,
  ImportResult,
  InboundOrder,
  InboundOrderDetail,
  InventoryBalance,
  InventoryTransaction,
  OutboundOrder,
  OutboundOrderDetail,
  Sku,
  Warehouse,
  Zone,
} from './types'

const baseURL = import.meta.env.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const key = localStorage.getItem('wms_api_key')
  if (key) config.headers['X-Api-Key'] = key

  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  } else if (config.data && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
})

export const healthApi = {
  check: () => api.get<{ status: string }>('/health'),
}

export const clientsApi = {
  list: () => api.get<Client[]>('/api/clients'),
  create: (body: { code: string; name: string; description?: string }) =>
    api.post<Client>('/api/clients', body),
}

export const warehousesApi = {
  list: (clientId?: string) =>
    api.get<Warehouse[]>('/api/warehouses', { params: { clientId } }),
  create: (body: {
    clientId: string
    code: string
    name: string
    address?: string
  }) => api.post<Warehouse>('/api/warehouses', body),
}

export const zonesApi = {
  list: (warehouseId?: string) =>
    api.get<Zone[]>('/api/zones', { params: { warehouseId } }),
  create: (body: { warehouseId: string; code: string; name: string }) =>
    api.post<Zone>('/api/zones', body),
}

export const binsApi = {
  list: (zoneId?: string) => api.get<Bin[]>('/api/bins', { params: { zoneId } }),
  create: (body: {
    zoneId: string
    code: string
    name?: string
    barcode?: string
  }) => api.post<Bin>('/api/bins', body),
}

export const skusApi = {
  list: (clientId?: string) =>
    api.get<Sku[]>('/api/skus', { params: { clientId } }),
  create: (body: {
    clientId: string
    code: string
    name: string
    uom?: string
    barcode?: string
  }) => api.post<Sku>('/api/skus', body),
}

export const inventoryApi = {
  balances: (params: Record<string, string | undefined>) =>
    api.get<InventoryBalance[]>('/api/inventory/balances', { params }),
  transactions: (params: Record<string, string | undefined>) =>
    api.get<InventoryTransaction[]>('/api/inventory/transactions', { params }),
  transfer: (body: Record<string, unknown>) =>
    api.post('/api/inventory/transfer', body),
}

export const inboundApi = {
  list: (params?: {
    clientId?: string
    warehouseId?: string
    status?: string
    source?: string
  }) => api.get<InboundOrder[]>('/api/inbound-orders', { params }),
  get: (id: string) => api.get<InboundOrderDetail>(`/api/inbound-orders/${id}`),
  create: (body: Record<string, unknown>) =>
    api.post<InboundOrder>('/api/inbound-orders', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<InboundOrderDetail>(`/api/inbound-orders/${id}`, body),
  receive: (
    id: string,
    body: {
      asnNumber: string
      lines: Array<{
        lineId: string
        binId: string
        quantity: number | string
        lotNumber?: string
        expiryDate?: string
        manufactureDate?: string
      }>
    },
  ) => api.post(`/api/inbound-orders/${id}/receive`, body),
  downloadTemplate: () =>
    api.get<Blob>('/api/inbound-orders/import/template', {
      responseType: 'blob',
    }),
  importExcel: (clientId: string, file: File) => {
    const form = new FormData()
    form.append('clientId', clientId)
    form.append('file', file)
    return api.post<ImportResult>('/api/inbound-orders/import', form)
  },
}

export const outboundApi = {
  list: (params?: {
    clientId?: string
    warehouseId?: string
    status?: string
    source?: string
  }) => api.get<OutboundOrder[]>('/api/outbound-orders', { params }),
  get: (id: string) =>
    api.get<OutboundOrderDetail>(`/api/outbound-orders/${id}`),
  create: (body: Record<string, unknown>) =>
    api.post<OutboundOrder>('/api/outbound-orders', body),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<OutboundOrderDetail>(`/api/outbound-orders/${id}`, body),
  ship: (
    id: string,
    body?: { lines?: Array<{ lineId: string; quantity?: number | string }> },
  ) => api.post(`/api/outbound-orders/${id}/ship`, body ?? {}),
  downloadTemplate: () =>
    api.get<Blob>('/api/outbound-orders/import/template', {
      responseType: 'blob',
    }),
  importExcel: (clientId: string, file: File) => {
    const form = new FormData()
    form.append('clientId', clientId)
    form.append('file', file)
    return api.post<ImportResult>('/api/outbound-orders/import', form)
  },
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
