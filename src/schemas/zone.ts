import { z } from "zod";

export const createZoneSchema = z.object({
  warehouseId: z.string().cuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateZoneSchema = createZoneSchema
  .omit({ warehouseId: true })
  .partial();

export const zoneIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const warehouseIdParamSchema = z.object({
  warehouseId: z.string().cuid(),
});
