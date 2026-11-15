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

export const createInboundOrderSchema = z.object({
  clientId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  asnNumber: z.string().trim().min(1).max(64),
  notes: z.string().trim().max(2000).optional().nullable(),
  expectedAt: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "OPEN"]).optional(),
  source: z.enum(["MANUAL", "API", "IMPORT"]).optional(),
  externalRef: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(
      z.object({
        skuId: z.string().cuid(),
        expectedQty: qtySchema,
        lotNumber: z.string().trim().max(128).optional().nullable(),
        expiryDate: dateOnlySchema,
        manufactureDate: dateOnlySchema,
      }),
    )
    .min(1),
});

export const updateInboundOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
  expectedAt: z.string().datetime().optional().nullable(),
  status: z.enum(["DRAFT", "OPEN", "CANCELLED"]).optional(),
  externalRef: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(
      z.object({
        id: z.string().cuid().optional(),
        skuId: z.string().cuid().optional(),
        expectedQty: qtySchema.optional(),
        lotNumber: z.string().trim().max(128).optional().nullable(),
        expiryDate: dateOnlySchema,
        manufactureDate: dateOnlySchema,
        _delete: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const receiveInboundSchema = z.object({
  asnNumber: z.string().trim().min(1).max(64),
  lines: z
    .array(
      z.object({
        lineId: z.string().cuid(),
        binId: z.string().cuid(),
        quantity: qtySchema,
        lotNumber: z.string().trim().max(128).optional().nullable(),
        expiryDate: dateOnlySchema,
        manufactureDate: dateOnlySchema,
      }),
    )
    .min(1),
});

export const inboundIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const inboundImportQuerySchema = z.object({
  clientId: z.string().cuid(),
});
