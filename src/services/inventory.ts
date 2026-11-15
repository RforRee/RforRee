import {
  InventoryTxnType,
  Prisma,
  type InventoryBalance,
  type InventoryTransaction,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import { toDateOnly } from "../lib/dates.js";

type Tx = Prisma.TransactionClient;

export type InventoryDimension = {
  clientId: string;
  skuId: string;
  binId: string;
  lotNumber?: string | null;
  expiryDate?: string | Date | null;
  manufactureDate?: string | Date | null;
};

export type InventoryChangeInput = InventoryDimension & {
  quantity: number | string | Prisma.Decimal;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
};

export type TransferInput = Omit<InventoryChangeInput, "binId"> & {
  fromBinId: string;
  toBinId: string;
};

function normalizeLot(lotNumber?: string | null): string {
  return (lotNumber ?? "").trim();
}

function asDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  const d = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (d.isNaN()) {
    throw new AppError("Quantity must be a valid number", 400, "INVALID_QTY");
  }
  return d;
}

function dimensionWhere(dim: {
  skuId: string;
  binId: string;
  lotNumber: string;
  expiryDate: Date | null;
  manufactureDate: Date | null;
}): Prisma.InventoryBalanceWhereInput {
  return {
    skuId: dim.skuId,
    binId: dim.binId,
    lotNumber: dim.lotNumber,
    expiryDate: dim.expiryDate,
    manufactureDate: dim.manufactureDate,
  };
}

async function findBalanceForUpdate(
  tx: Tx,
  dim: {
    skuId: string;
    binId: string;
    lotNumber: string;
    expiryDate: Date | null;
    manufactureDate: Date | null;
  },
): Promise<InventoryBalance | null> {
  // Lock matching row(s) to serialize concurrent updates on the same dimension.
  const rows = await tx.$queryRaw<InventoryBalance[]>`
    SELECT *
    FROM "InventoryBalance"
    WHERE "skuId" = ${dim.skuId}
      AND "binId" = ${dim.binId}
      AND "lotNumber" = ${dim.lotNumber}
      AND "expiryDate" IS NOT DISTINCT FROM ${dim.expiryDate}::date
      AND "manufactureDate" IS NOT DISTINCT FROM ${dim.manufactureDate}::date
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Shared inventory engine: every stock change writes a ledger transaction first,
 * then atomically updates the corresponding multi-dimensional balance.
 */
export class InventoryService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async applyInbound(
    input: InventoryChangeInput,
    tx?: Tx,
  ): Promise<{ transaction: InventoryTransaction; balance: InventoryBalance }> {
    const qty = asDecimal(input.quantity);
    if (qty.lte(0)) {
      throw new AppError("Inbound quantity must be positive", 400, "INVALID_QTY");
    }
    return this.applyChange(
      { ...input, quantity: qty, type: InventoryTxnType.INBOUND },
      tx,
    );
  }

  async applyOutbound(
    input: InventoryChangeInput,
    tx?: Tx,
  ): Promise<{ transaction: InventoryTransaction; balance: InventoryBalance }> {
    const qty = asDecimal(input.quantity);
    if (qty.lte(0)) {
      throw new AppError("Outbound quantity must be positive", 400, "INVALID_QTY");
    }
    return this.applyChange(
      {
        ...input,
        quantity: qty.neg(),
        type: InventoryTxnType.OUTBOUND,
      },
      tx,
    );
  }

  async applyAdjustment(
    input: InventoryChangeInput & { quantity: number | string | Prisma.Decimal },
    tx?: Tx,
  ): Promise<{ transaction: InventoryTransaction; balance: InventoryBalance }> {
    const qty = asDecimal(input.quantity);
    if (qty.isZero()) {
      throw new AppError("Adjustment quantity cannot be zero", 400, "INVALID_QTY");
    }
    return this.applyChange(
      { ...input, quantity: qty, type: InventoryTxnType.ADJUSTMENT },
      tx,
    );
  }

  /**
   * Move stock between bins (same SKU/Lot/ED/MD). Writes TRANSFER_OUT then
   * TRANSFER_IN ledger rows and updates both balances in one DB transaction.
   */
  async applyTransfer(input: TransferInput, outerTx?: Tx) {
    const qty = asDecimal(input.quantity);
    if (qty.lte(0)) {
      throw new AppError("Transfer quantity must be positive", 400, "INVALID_QTY");
    }
    if (input.fromBinId === input.toBinId) {
      throw new AppError("fromBinId and toBinId must differ", 400, "INVALID_TRANSFER");
    }

    const run = async (tx: Tx) => {
      const out = await this.applyChange(
        {
          ...input,
          binId: input.fromBinId,
          quantity: qty.neg(),
          type: InventoryTxnType.TRANSFER_OUT,
        },
        tx,
      );
      const inn = await this.applyChange(
        {
          ...input,
          binId: input.toBinId,
          quantity: qty,
          type: InventoryTxnType.TRANSFER_IN,
        },
        tx,
      );
      return { out, in: inn };
    };

    if (outerTx) return run(outerTx);
    return this.db.$transaction(run);
  }

  /**
   * Allocate and deduct quantity for a SKU within a warehouse using FIFO by
   * expiry date (null ED last). Optionally restrict to a lot number.
   */
  async allocateAndDeductFifo(
    params: {
      clientId: string;
      warehouseId: string;
      skuId: string;
      quantity: number | string | Prisma.Decimal;
      lotNumber?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
      notes?: string | null;
    },
    outerTx?: Tx,
  ): Promise<{
    allocations: Array<{
      balanceId: string;
      binId: string;
      lotNumber: string;
      expiryDate: Date | null;
      manufactureDate: Date | null;
      quantity: Prisma.Decimal;
      transaction: InventoryTransaction;
    }>;
  }> {
    const need = asDecimal(params.quantity);
    if (need.lte(0)) {
      throw new AppError("Quantity must be positive", 400, "INVALID_QTY");
    }

    const run = async (tx: Tx) => {
      const lotFilter =
        params.lotNumber != null && params.lotNumber !== ""
          ? Prisma.sql`AND b."lotNumber" = ${normalizeLot(params.lotNumber)}`
          : Prisma.empty;

      const candidates = await tx.$queryRaw<
        Array<{
          id: string;
          binId: string;
          lotNumber: string;
          expiryDate: Date | null;
          manufactureDate: Date | null;
          quantity: Prisma.Decimal;
        }>
      >`
        SELECT b.id, b."binId", b."lotNumber", b."expiryDate", b."manufactureDate", b.quantity
        FROM "InventoryBalance" b
        INNER JOIN "Bin" bin ON bin.id = b."binId"
        INNER JOIN "Zone" z ON z.id = bin."zoneId"
        WHERE b."clientId" = ${params.clientId}
          AND b."skuId" = ${params.skuId}
          AND z."warehouseId" = ${params.warehouseId}
          AND b.quantity > 0
          ${lotFilter}
        ORDER BY b."expiryDate" ASC NULLS LAST, b."manufactureDate" ASC NULLS LAST, b."createdAt" ASC
        FOR UPDATE OF b
      `;

      let remaining = need;
      const allocations: Array<{
        balanceId: string;
        binId: string;
        lotNumber: string;
        expiryDate: Date | null;
        manufactureDate: Date | null;
        quantity: Prisma.Decimal;
        transaction: InventoryTransaction;
      }> = [];

      for (const row of candidates) {
        if (remaining.lte(0)) break;
        const available = new Prisma.Decimal(row.quantity);
        const take = Prisma.Decimal.min(available, remaining);
        if (take.lte(0)) continue;

        const { transaction } = await this.applyChange(
          {
            clientId: params.clientId,
            skuId: params.skuId,
            binId: row.binId,
            lotNumber: row.lotNumber,
            expiryDate: row.expiryDate,
            manufactureDate: row.manufactureDate,
            quantity: take.neg(),
            type: InventoryTxnType.OUTBOUND,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            notes: params.notes,
          },
          tx,
        );

        allocations.push({
          balanceId: row.id,
          binId: row.binId,
          lotNumber: row.lotNumber,
          expiryDate: row.expiryDate,
          manufactureDate: row.manufactureDate,
          quantity: take,
          transaction,
        });
        remaining = remaining.minus(take);
      }

      if (remaining.gt(0)) {
        throw new AppError(
          `Insufficient inventory for SKU ${params.skuId}: need ${need.toString()}, short ${remaining.toString()}`,
          409,
          "INSUFFICIENT_INVENTORY",
        );
      }

      return { allocations };
    };

    if (outerTx) return run(outerTx);
    return this.db.$transaction(run);
  }

  private async applyChange(
    input: InventoryChangeInput & { type: InventoryTxnType },
    outerTx?: Tx,
  ): Promise<{ transaction: InventoryTransaction; balance: InventoryBalance }> {
    const signedQty = asDecimal(input.quantity);
    if (signedQty.isZero()) {
      throw new AppError("Quantity cannot be zero", 400, "INVALID_QTY");
    }

    const dim = {
      clientId: input.clientId,
      skuId: input.skuId,
      binId: input.binId,
      lotNumber: normalizeLot(input.lotNumber),
      expiryDate: toDateOnly(input.expiryDate),
      manufactureDate: toDateOnly(input.manufactureDate),
    };

    const run = async (tx: Tx) => {
      // 1) Ledger first (append-only).
      const transaction = await tx.inventoryTransaction.create({
        data: {
          clientId: dim.clientId,
          type: input.type,
          skuId: dim.skuId,
          binId: dim.binId,
          lotNumber: dim.lotNumber,
          expiryDate: dim.expiryDate,
          manufactureDate: dim.manufactureDate,
          quantity: signedQty,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          notes: input.notes ?? null,
        },
      });

      // 2) Atomic balance update under row lock.
      const existing = await findBalanceForUpdate(tx, dim);

      let balance: InventoryBalance;
      if (!existing) {
        if (signedQty.lt(0)) {
          throw new AppError(
            "Insufficient inventory: no balance for this SKU/Lot/ED/MD/Bin",
            409,
            "INSUFFICIENT_INVENTORY",
          );
        }
        balance = await tx.inventoryBalance.create({
          data: {
            clientId: dim.clientId,
            skuId: dim.skuId,
            binId: dim.binId,
            lotNumber: dim.lotNumber,
            expiryDate: dim.expiryDate,
            manufactureDate: dim.manufactureDate,
            quantity: signedQty,
          },
        });
      } else {
        const nextQty = new Prisma.Decimal(existing.quantity).plus(signedQty);
        if (nextQty.lt(0)) {
          throw new AppError(
            `Insufficient inventory on bin ${dim.binId}: on-hand ${existing.quantity.toString()}, delta ${signedQty.toString()}`,
            409,
            "INSUFFICIENT_INVENTORY",
          );
        }
        balance = await tx.inventoryBalance.update({
          where: { id: existing.id },
          data: { quantity: nextQty },
        });
      }

      return { transaction, balance };
    };

    if (outerTx) return run(outerTx);
    return this.db.$transaction(run);
  }

  /** Convenience for tests / debugging — find balance by dimension. */
  async getBalance(dim: InventoryDimension): Promise<InventoryBalance | null> {
    return this.db.inventoryBalance.findFirst({
      where: dimensionWhere({
        skuId: dim.skuId,
        binId: dim.binId,
        lotNumber: normalizeLot(dim.lotNumber),
        expiryDate: toDateOnly(dim.expiryDate),
        manufactureDate: toDateOnly(dim.manufactureDate),
      }),
    });
  }
}

export const inventoryService = new InventoryService();
