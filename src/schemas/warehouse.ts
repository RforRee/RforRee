import { z } from "zod";

export const createWarehouseSchema = z.object({
  clientId: z.string().cuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  address: z.string().trim().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema
  .omit({ clientId: true })
  .partial();

export const warehouseIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const clientIdParamSchema = z.object({
  clientId: z.string().cuid(),
});
