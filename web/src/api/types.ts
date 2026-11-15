export type Client = {
  id: string
  code: string
  name: string
  description?: string | null
  isActive: boolean
}

export type Warehouse = {
  id: string
  clientId: string
  code: string
  name: string
  address?: string | null
  isActive: boolean
}

export type Zone = {
  id: string
  warehouseId: string
  code: string
  name: string
  description?: string | null
  isActive: boolean
}

export type Bin = {
  id: string
  zoneId: string
  code: string
  name?: string | null
  barcode?: string | null
  isActive: boolean
}

export type Sku = {
  id: string
  clientId: string
  code: string
  name: string
  description?: string | null
  uom: string
  barcode?: string | null
  isActive: boolean
}

export type InventoryBalance = {
  id: string
  clientId: string
  skuId: string
  binId: string
  lotNumber: string
  expiryDate?: string | null
  manufactureDate?: string | null
  quantity: string
}

export type InventoryTransaction = {
  id: string
  clientId: string
  type: string
  skuId: string
  binId: string
  lotNumber: string
  expiryDate?: string | null
  manufactureDate?: string | null
  quantity: string
  referenceType?: string | null
  referenceId?: string | null
  notes?: string | null
  createdAt: string
}

export type InboundOrderLine = {
  id: string
  inboundOrderId: string
  skuId: string
  expectedQty: string
  receivedQty: string
  lotNumber: string
  expiryDate?: string | null
  manufactureDate?: string | null
}

export type InboundOrder = {
  id: string
  clientId: string
  warehouseId: string
  asnNumber: string
  status: string
  notes?: string | null
  expectedAt?: string | null
  completedAt?: string | null
  createdAt: string
  lines: InboundOrderLine[]
}

export type OutboundOrderLine = {
  id: string
  outboundOrderId: string
  skuId: string
  requestedQty: string
  shippedQty: string
  lotNumber?: string | null
}

export type OutboundOrder = {
  id: string
  clientId: string
  warehouseId: string
  orderNumber: string
  status: string
  notes?: string | null
  shippedAt?: string | null
  createdAt: string
  lines: OutboundOrderLine[]
}
