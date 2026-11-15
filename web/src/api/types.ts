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
  sku?: { code: string; name: string }
  bin?: { code: string; barcode?: string | null }
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
  sku?: Sku
}

export type InboundOrder = {
  id: string
  clientId: string
  warehouseId: string
  asnNumber: string
  status: string
  source?: string
  externalRef?: string | null
  notes?: string | null
  expectedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt?: string
  lines: InboundOrderLine[]
  warehouse?: Pick<Warehouse, 'id' | 'code' | 'name'>
  client?: Pick<Client, 'id' | 'code' | 'name'>
}

export type OutboundOrderLine = {
  id: string
  outboundOrderId: string
  skuId: string
  requestedQty: string
  shippedQty: string
  lotNumber?: string | null
  sku?: Sku
}

export type OutboundOrder = {
  id: string
  clientId: string
  warehouseId: string
  orderNumber: string
  status: string
  source?: string
  externalRef?: string | null
  notes?: string | null
  shippedAt?: string | null
  createdAt: string
  updatedAt?: string
  lines: OutboundOrderLine[]
  warehouse?: Pick<Warehouse, 'id' | 'code' | 'name'>
  client?: Pick<Client, 'id' | 'code' | 'name'>
}

export type SyncMutationReceipt = {
  id: string
  deviceId: string
  mutationType: string
  status: string
  conflictCode?: string | null
  message?: string | null
  serverEntityId?: string | null
  createdAt: string
  payload?: unknown
}

export type InboundOrderDetail = {
  order: InboundOrder
  progress: {
    expectedQty: number
    receivedQty: number
    percent: number
    lineCount: number
    completedLines: number
  }
  transactions: InventoryTransaction[]
  handheldActivity: SyncMutationReceipt[]
}

export type OutboundOrderDetail = {
  order: OutboundOrder
  progress: {
    requestedQty: number
    shippedQty: number
    percent: number
    lineCount: number
    completedLines: number
  }
  transactions: InventoryTransaction[]
  handheldActivity: SyncMutationReceipt[]
}

export type ImportResult = {
  createdCount: number
  errorCount: number
  orders: Array<InboundOrder | OutboundOrder>
  errors: Array<{ asnNumber?: string; orderNumber?: string; error: string }>
}
