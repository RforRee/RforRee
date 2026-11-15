import axios from 'axios'
import type {
  Bin,
  Client,
  InboundOrder,
  InventoryBalance,
  InventoryTransaction,
  OutboundOrder,
  Sku,
  Warehouse,
  Zone,
} from './types'

const baseURL = import.meta.env.VITE_API_BASE_URL || ''

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const key = localStorage.getItem('wms_api_key')
  if (key) {
    config.headers['X-Api-Key'] = key
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
  list: (params?: { clientId?: string; warehouseId?: string; status?: string }) =>
    api.get<InboundOrder[]>('/api/inbound-orders', { params }),
  create: (body: Record<string, unknown>) =>
    api.post<InboundOrder>('/api/inbound-orders', body),
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
}

export const outboundApi = {
  list: (params?: { clientId?: string; warehouseId?: string; status?: string }) =>
    api.get<OutboundOrder[]>('/api/outbound-orders', { params }),
  create: (body: Record<string, unknown>) =>
    api.post<OutboundOrder>('/api/outbound-orders', body),
  ship: (
    id: string,
    body?: { lines?: Array<{ lineId: string; quantity?: number | string }> },
  ) => api.post(`/api/outbound-orders/${id}/ship`, body ?? {}),
}
