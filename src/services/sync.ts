import {
  InboundOrderStatus,
  OutboundOrderStatus,
  Prisma,
  SyncMutationStatus,
} from "@prisma/client";
import { AppError, isAppError } from "../errors.js";
import { toDateOnly } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { inventoryService } from "./inventory.js";
import { receiveInboundOrder } from "./inbound.js";
import { shipOutboundOrder } from "./outbound.js";

const PENDING_INBOUND: InboundOrderStatus[] = [
  InboundOrderStatus.OPEN,
  InboundOrderStatus.RECEIVING,
];

const PENDING_OUTBOUND: OutboundOrderStatus[] = [
  OutboundOrderStatus.OPEN,
  OutboundOrderStatus.SHIPPING,
];

export type SyncPullInput = {
  clientId: string;
  warehouseId: string;
  /** Optional incremental cursor (ISO timestamp of last successful pull). */
  since?: string | null;
};

export async function syncPull(input: SyncPullInput) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
  });
  if (!warehouse || warehouse.clientId !== input.clientId) {
    throw new AppError(
      "warehouseId does not belong to clientId",
      400,
      "INVALID_WAREHOUSE",
    );
  }

  const since = input.since ? new Date(input.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    throw new AppError("Invalid since timestamp", 400, "INVALID_SINCE");
  }

  const updatedFilter = since ? { updatedAt: { gt: since } } : undefined;

  const [skus, zones, inboundOrders, outboundOrders, balances] =
    await Promise.all([
      prisma.sku.findMany({
        where: { clientId: input.clientId, isActive: true, ...updatedFilter },
        orderBy: { code: "asc" },
      }),
      prisma.zone.findMany({
        where: { warehouseId: input.warehouseId, ...(since ? { updatedAt: { gt: since } } : {}) },
        include: {
          bins: {
            where: { isActive: true },
            orderBy: { code: "asc" },
          },
        },
        orderBy: { code: "asc" },
      }),
      prisma.inboundOrder.findMany({
        where: {
          clientId: input.clientId,
          warehouseId: input.warehouseId,
          status: { in: PENDING_INBOUND },
        },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.outboundOrder.findMany({
        where: {
          clientId: input.clientId,
          warehouseId: input.warehouseId,
          status: { in: PENDING_OUTBOUND },
        },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.inventoryBalance.findMany({
        where: {
          clientId: input.clientId,
          quantity: { gt: 0 },
          bin: { zone: { warehouseId: input.warehouseId } },
        },
        orderBy: [{ skuId: "asc" }, { expiryDate: "asc" }],
      }),
    ]);

  const bins = zones.flatMap((z) =>
    z.bins.map((b) => ({
      ...b,
      zoneId: z.id,
      zoneCode: z.code,
      warehouseId: input.warehouseId,
    })),
  );

  const serverTime = new Date().toISOString();

  return {
    serverTime,
    syncToken: serverTime,
    warehouse: {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      clientId: warehouse.clientId,
    },
    master: {
      skus,
      bins,
      zones: zones.map(({ bins: _b, ...z }) => z),
    },
    tasks: {
      inboundOrders,
      outboundOrders,
    },
    inventoryBalances: balances,
    /**
     * Client guidance for offline-first (WatermelonDB / SQLite / IndexedDB):
     * persist `master` + `tasks` + `inventoryBalances`, enqueue local mutations,
     * then POST /api/sync/push when online.
     */
    offlineHints: {
      localStores: ["skus", "bins", "zones", "inboundOrders", "outboundOrders", "balances", "mutationQueue"],
      suggestedClientStack: ["WatermelonDB", "SQLite", "IndexedDB"],
    },
  };
}

export type SyncMutation =
  | {
      clientMutationId: string;
      type: "RECEIVE";
      occurredAt?: string;
      payload: {
        inboundOrderId: string;
        asnNumber: string;
        lineId: string;
        binId: string;
        quantity: number | string;
        lotNumber?: string | null;
        expiryDate?: string | null;
        manufactureDate?: string | null;
      };
    }
  | {
      clientMutationId: string;
      type: "SHIP";
      occurredAt?: string;
      payload: {
        outboundOrderId: string;
        lineId: string;
        quantity?: number | string;
      };
    }
  | {
      clientMutationId: string;
      type: "TRANSFER";
      occurredAt?: string;
      payload: {
        skuId: string;
        fromBinId: string;
        toBinId: string;
        quantity: number | string;
        lotNumber?: string | null;
        expiryDate?: string | null;
        manufactureDate?: string | null;
      };
    }
  | {
      clientMutationId: string;
      type: "ADJUST";
      occurredAt?: string;
      payload: {
        skuId: string;
        binId: string;
        quantity: number | string;
        lotNumber?: string | null;
        expiryDate?: string | null;
        manufactureDate?: string | null;
        notes?: string | null;
      };
    };

export type SyncPushInput = {
  clientId: string;
  deviceId: string;
  warehouseId: string;
  mutations: SyncMutation[];
};

export type SyncPushResultItem = {
  clientMutationId: string;
  status: SyncMutationStatus;
  conflictCode?: string | null;
  message?: string | null;
  serverEntityId?: string | null;
};

export async function syncPush(input: SyncPushInput) {
  if (!input.deviceId.trim()) {
    throw new AppError("deviceId is required", 400);
  }
  if (!input.mutations.length) {
    throw new AppError("mutations must not be empty", 400);
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
  });
  if (!warehouse || warehouse.clientId !== input.clientId) {
    throw new AppError(
      "warehouseId does not belong to clientId",
      400,
      "INVALID_WAREHOUSE",
    );
  }

  const results: SyncPushResultItem[] = [];

  for (const mutation of input.mutations) {
    const existing = await prisma.syncMutationReceipt.findUnique({
      where: {
        clientId_deviceId_clientMutationId: {
          clientId: input.clientId,
          deviceId: input.deviceId,
          clientMutationId: mutation.clientMutationId,
        },
      },
    });

    if (existing) {
      results.push({
        clientMutationId: mutation.clientMutationId,
        status: SyncMutationStatus.DUPLICATE,
        conflictCode: existing.conflictCode,
        message: existing.message ?? "Already processed (idempotent replay)",
        serverEntityId: existing.serverEntityId,
      });
      continue;
    }

    try {
      const applied = await applyMutation(input, mutation);
      await prisma.syncMutationReceipt.create({
        data: {
          clientId: input.clientId,
          deviceId: input.deviceId,
          warehouseId: input.warehouseId,
          clientMutationId: mutation.clientMutationId,
          mutationType: mutation.type,
          status: SyncMutationStatus.ACCEPTED,
          serverEntityId: applied.serverEntityId,
          payload: mutation as unknown as Prisma.InputJsonValue,
          result: applied.result as Prisma.InputJsonValue,
          message: "Accepted",
        },
      });
      results.push({
        clientMutationId: mutation.clientMutationId,
        status: SyncMutationStatus.ACCEPTED,
        message: "Accepted",
        serverEntityId: applied.serverEntityId,
      });
    } catch (error) {
      const { status, conflictCode, message } = classifySyncError(error);
      await prisma.syncMutationReceipt.create({
        data: {
          clientId: input.clientId,
          deviceId: input.deviceId,
          warehouseId: input.warehouseId,
          clientMutationId: mutation.clientMutationId,
          mutationType: mutation.type,
          status,
          conflictCode,
          message,
          payload: mutation as unknown as Prisma.InputJsonValue,
        },
      });
      results.push({
        clientMutationId: mutation.clientMutationId,
        status,
        conflictCode,
        message,
      });
    }
  }

  const summary = {
    accepted: results.filter((r) => r.status === SyncMutationStatus.ACCEPTED)
      .length,
    rejected: results.filter((r) => r.status === SyncMutationStatus.REJECTED)
      .length,
    conflicts: results.filter((r) => r.status === SyncMutationStatus.CONFLICT)
      .length,
    duplicates: results.filter((r) => r.status === SyncMutationStatus.DUPLICATE)
      .length,
  };

  return { results, summary };
}

async function applyMutation(
  input: SyncPushInput,
  mutation: SyncMutation,
): Promise<{ serverEntityId: string | null; result: unknown }> {
  switch (mutation.type) {
    case "RECEIVE": {
      const out = await receiveInboundOrder(mutation.payload.inboundOrderId, {
        asnNumber: mutation.payload.asnNumber,
        lines: [
          {
            lineId: mutation.payload.lineId,
            binId: mutation.payload.binId,
            quantity: mutation.payload.quantity,
            lotNumber: mutation.payload.lotNumber,
            expiryDate: mutation.payload.expiryDate,
            manufactureDate: mutation.payload.manufactureDate,
          },
        ],
      });
      const txnId = out.receipts[0]?.transaction.id ?? null;
      return { serverEntityId: txnId, result: { orderStatus: out.order.status } };
    }
    case "SHIP": {
      const out = await shipOutboundOrder(mutation.payload.outboundOrderId, {
        lines: [
          {
            lineId: mutation.payload.lineId,
            quantity: mutation.payload.quantity,
          },
        ],
      });
      const txnId =
        out.shipments[0]?.allocations[0]?.transactionId ?? out.order.id;
      return { serverEntityId: txnId, result: { orderStatus: out.order.status } };
    }
    case "TRANSFER": {
      const out = await inventoryService.applyTransfer({
        clientId: input.clientId,
        skuId: mutation.payload.skuId,
        fromBinId: mutation.payload.fromBinId,
        toBinId: mutation.payload.toBinId,
        quantity: mutation.payload.quantity,
        lotNumber: mutation.payload.lotNumber,
        expiryDate: toDateOnly(mutation.payload.expiryDate),
        manufactureDate: toDateOnly(mutation.payload.manufactureDate),
        referenceType: "SyncPush",
        referenceId: mutation.clientMutationId,
      });
      return {
        serverEntityId: out.out.transaction.id,
        result: {
          outTxn: out.out.transaction.id,
          inTxn: out.in.transaction.id,
        },
      };
    }
    case "ADJUST": {
      const out = await inventoryService.applyAdjustment({
        clientId: input.clientId,
        skuId: mutation.payload.skuId,
        binId: mutation.payload.binId,
        quantity: mutation.payload.quantity,
        lotNumber: mutation.payload.lotNumber,
        expiryDate: toDateOnly(mutation.payload.expiryDate),
        manufactureDate: toDateOnly(mutation.payload.manufactureDate),
        notes: mutation.payload.notes,
        referenceType: "SyncPush",
        referenceId: mutation.clientMutationId,
      });
      return {
        serverEntityId: out.transaction.id,
        result: { balanceId: out.balance.id },
      };
    }
    default: {
      const _exhaustive: never = mutation;
      throw new AppError(
        `Unsupported mutation type: ${JSON.stringify(_exhaustive)}`,
        400,
      );
    }
  }
}

function classifySyncError(error: unknown): {
  status: SyncMutationStatus;
  conflictCode: string;
  message: string;
} {
  if (isAppError(error)) {
    const conflict =
      error.code === "INSUFFICIENT_INVENTORY" ||
      error.code === "OVER_RECEIVE" ||
      error.code === "OVER_SHIP" ||
      error.code === "INVALID_STATUS" ||
      error.code === "ASN_MISMATCH";
    return {
      status: conflict
        ? SyncMutationStatus.CONFLICT
        : SyncMutationStatus.REJECTED,
      conflictCode: error.code ?? "APP_ERROR",
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      status: SyncMutationStatus.REJECTED,
      conflictCode: "INTERNAL",
      message: error.message,
    };
  }
  return {
    status: SyncMutationStatus.REJECTED,
    conflictCode: "UNKNOWN",
    message: "Unknown error",
  };
}
