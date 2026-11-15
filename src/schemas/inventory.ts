import { z } from "zod";

const qtySchema = z.union([
  z.number().positive(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number(v) > 0, "Quantity must be positive"),
]);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional()
  .nullable();

const dimensionSchema = z.object({
  clientId: z.string().cuid(),
  skuId: z.string().cuid(),
  binId: z.string().cuid(),
  lotNumber: z.string().trim().max(128).optional().nullable(),
  expiryDate: dateOnlySchema,
  manufactureDate: dateOnlySchema,
  quantity: qtySchema,
  referenceType: z.string().trim().max(64).optional().nullable(),
  referenceId: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const transferInventorySchema = dimensionSchema
  .omit({ binId: true })
  .extend({
    fromBinId: z.string().cuid(),
    toBinId: z.string().cuid(),
  });

export const listBalancesQuerySchema = z.object({
  clientId: z.string().cuid().optional(),
  skuId: z.string().cuid().optional(),
  binId: z.string().cuid().optional(),
  lotNumber: z.string().optional(),
  warehouseId: z.string().cuid().optional(),
});

export const listTransactionsQuerySchema = z.object({
  clientId: z.string().cuid().optional(),
  skuId: z.string().cuid().optional(),
  binId: z.string().cuid().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
