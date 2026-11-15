import { z } from "zod";

export const createBinSchema = z.object({
  zoneId: z.string().cuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().max(255).optional().nullable(),
  barcode: z.string().trim().max(128).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateBinSchema = createBinSchema.omit({ zoneId: true }).partial();

export const binIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const zoneIdParamSchema = z.object({
  zoneId: z.string().cuid(),
});
