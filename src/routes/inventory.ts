import { Router } from "express";
import { isAppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import {
  asyncHandler,
  validate,
  type ValidatedRequest,
} from "../lib/validate.js";
import {
  listBalancesQuerySchema,
  listTransactionsQuerySchema,
  transferInventorySchema,
} from "../schemas/inventory.js";
import { inventoryService } from "../services/inventory.js";

export const inventoryRouter = Router();

inventoryRouter.get(
  "/balances",
  validate(listBalancesQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const q = ((req as ValidatedRequest).validated?.query ?? {}) as {
      clientId?: string;
      skuId?: string;
      binId?: string;
      lotNumber?: string;
      warehouseId?: string;
    };

    const balances = await prisma.inventoryBalance.findMany({
      where: {
        clientId: q.clientId,
        skuId: q.skuId,
        binId: q.binId,
        lotNumber: q.lotNumber,
        ...(q.warehouseId
          ? { bin: { zone: { warehouseId: q.warehouseId } } }
          : {}),
      },
      orderBy: [{ skuId: "asc" }, { expiryDate: "asc" }],
    });
    res.json(balances);
  }),
);

inventoryRouter.get(
  "/transactions",
  validate(listTransactionsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const q = ((req as ValidatedRequest).validated?.query ?? {}) as {
      clientId?: string;
      skuId?: string;
      binId?: string;
      referenceType?: string;
      referenceId?: string;
      limit?: number;
    };

    const transactions = await prisma.inventoryTransaction.findMany({
      where: {
        clientId: q.clientId,
        skuId: q.skuId,
        binId: q.binId,
        referenceType: q.referenceType,
        referenceId: q.referenceId,
      },
      orderBy: { createdAt: "desc" },
      take: q.limit ?? 100,
    });
    res.json(transactions);
  }),
);

inventoryRouter.post(
  "/transfer",
  validate(transferInventorySchema),
  asyncHandler(async (req, res) => {
    try {
      const result = await inventoryService.applyTransfer(req.body);
      res.status(201).json(result);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);
