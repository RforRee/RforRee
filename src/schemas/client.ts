import { z } from "zod";

export const createClientSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const idParamSchema = z.object({
  id: z.string().cuid(),
});
