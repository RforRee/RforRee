-- CreateEnum
CREATE TYPE "InventoryTxnType" AS ENUM ('INBOUND', 'OUTBOUND', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "InboundOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'RECEIVING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboundOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'SHIPPING', 'SHIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "InventoryTxnType" NOT NULL,
    "skuId" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL DEFAULT '',
    "expiryDate" DATE,
    "manufactureDate" DATE,
    "quantity" DECIMAL(18,4) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL DEFAULT '',
    "expiryDate" DATE,
    "manufactureDate" DATE,
    "quantity" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundOrder" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "asnNumber" TEXT NOT NULL,
    "status" "InboundOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "expectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundOrderLine" (
    "id" TEXT NOT NULL,
    "inboundOrderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "expectedQty" DECIMAL(18,4) NOT NULL,
    "receivedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lotNumber" TEXT NOT NULL DEFAULT '',
    "expiryDate" DATE,
    "manufactureDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundOrder" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OutboundOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundOrderLine" (
    "id" TEXT NOT NULL,
    "outboundOrderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "requestedQty" DECIMAL(18,4) NOT NULL,
    "shippedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lotNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryTransaction_clientId_createdAt_idx" ON "InventoryTransaction"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_skuId_binId_idx" ON "InventoryTransaction"("skuId", "binId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryBalance_clientId_skuId_idx" ON "InventoryBalance"("clientId", "skuId");

-- CreateIndex
CREATE INDEX "InventoryBalance_skuId_expiryDate_idx" ON "InventoryBalance"("skuId", "expiryDate");

-- CreateIndex
CREATE INDEX "InventoryBalance_binId_idx" ON "InventoryBalance"("binId");

-- CreateIndex
CREATE INDEX "InboundOrder_warehouseId_idx" ON "InboundOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "InboundOrder_status_idx" ON "InboundOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InboundOrder_clientId_asnNumber_key" ON "InboundOrder"("clientId", "asnNumber");

-- CreateIndex
CREATE INDEX "InboundOrderLine_inboundOrderId_idx" ON "InboundOrderLine"("inboundOrderId");

-- CreateIndex
CREATE INDEX "InboundOrderLine_skuId_idx" ON "InboundOrderLine"("skuId");

-- CreateIndex
CREATE INDEX "OutboundOrder_warehouseId_idx" ON "OutboundOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "OutboundOrder_status_idx" ON "OutboundOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundOrder_clientId_orderNumber_key" ON "OutboundOrder"("clientId", "orderNumber");

-- CreateIndex
CREATE INDEX "OutboundOrderLine_outboundOrderId_idx" ON "OutboundOrderLine"("outboundOrderId");

-- CreateIndex
CREATE INDEX "OutboundOrderLine_skuId_idx" ON "OutboundOrderLine"("skuId");

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_binId_fkey" FOREIGN KEY ("binId") REFERENCES "Bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_binId_fkey" FOREIGN KEY ("binId") REFERENCES "Bin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundOrder" ADD CONSTRAINT "InboundOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundOrder" ADD CONSTRAINT "InboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundOrderLine" ADD CONSTRAINT "InboundOrderLine_inboundOrderId_fkey" FOREIGN KEY ("inboundOrderId") REFERENCES "InboundOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundOrderLine" ADD CONSTRAINT "InboundOrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrder" ADD CONSTRAINT "OutboundOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrder" ADD CONSTRAINT "OutboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrderLine" ADD CONSTRAINT "OutboundOrderLine_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundOrderLine" ADD CONSTRAINT "OutboundOrderLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Unique inventory dimension: SKU + Bin + Lot + ED + MD (null dates coalesced)
CREATE UNIQUE INDEX "InventoryBalance_dimension_key" ON "InventoryBalance" (
  "skuId",
  "binId",
  "lotNumber",
  (COALESCE("expiryDate", DATE '9999-12-31')),
  (COALESCE("manufactureDate", DATE '9999-12-31'))
);
