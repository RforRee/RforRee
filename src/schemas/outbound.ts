import { z } from "zod";

const qtySchema = z.union([
  z.number().positive(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number(v) > 0, "Quantity must be positive"),
]);

export const createOutboundOrderSchema = z.object({
  clientId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  orderNumber: z.string().trim().min(1).max(64),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["DRAFT", "OPEN"]).optional(),
  source: z.enum(["MANUAL", "API", "IMPORT"]).optional(),
  externalRef: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(
      z.object({
        skuId: z.string().cuid(),
        requestedQty: qtySchema,
        lotNumber: z.string().trim().max(128).optional().nullable(),
      }),
    )
    .min(1),
});

export const updateOutboundOrderSchema = z.object({
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["DRAFT", "OPEN", "CANCELLED"]).optional(),
  externalRef: z.string().trim().max(128).optional().nullable(),
  lines: z
    .array(
      z.object({
        id: z.string().cuid().optional(),
        skuId: z.string().cuid().optional(),
        requestedQty: qtySchema.optional(),
        lotNumber: z.string().trim().max(128).optional().nullable(),
        _delete: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const shipOutboundSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().cuid(),
        quantity: qtySchema.optional(),
      }),
    )
    .optional(),
});

export const outboundIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const outboundImportQuerySchema = z.object({
  clientId: z.string().cuid(),
});
