-- CreateEnum
CREATE TYPE "SyncMutationStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'CONFLICT', 'DUPLICATE');

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMutationReceipt" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "clientMutationId" TEXT NOT NULL,
    "mutationType" TEXT NOT NULL,
    "status" "SyncMutationStatus" NOT NULL,
    "conflictCode" TEXT,
    "message" TEXT,
    "serverEntityId" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_clientId_idx" ON "ApiKey"("clientId");

-- CreateIndex
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "SyncMutationReceipt_clientId_createdAt_idx" ON "SyncMutationReceipt"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncMutationReceipt_deviceId_idx" ON "SyncMutationReceipt"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncMutationReceipt_clientId_deviceId_clientMutationId_key" ON "SyncMutationReceipt"("clientId", "deviceId", "clientMutationId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncMutationReceipt" ADD CONSTRAINT "SyncMutationReceipt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

