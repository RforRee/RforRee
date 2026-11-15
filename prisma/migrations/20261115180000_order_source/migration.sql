-- AlterTable
ALTER TABLE "InboundOrder" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "OutboundOrder" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "InboundOrder_source_idx" ON "InboundOrder"("source");

-- CreateIndex
CREATE INDEX "OutboundOrder_source_idx" ON "OutboundOrder"("source");

