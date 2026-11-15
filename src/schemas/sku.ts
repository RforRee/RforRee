import { z } from "zod";

export const createSkuSchema = z.object({
  clientId: z.string().cuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  uom: z.string().trim().min(1).max(32).optional(),
  barcode: z.string().trim().max(128).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateSkuSchema = createSkuSchema.omit({ clientId: true }).partial();

export const skuIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const clientIdParamSchema = z.object({
  clientId: z.string().cuid(),
});
