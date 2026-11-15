import { z } from "zod";

const qtySchema = z.union([
  z.number().positive(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number(v) > 0, "Quantity must be positive"),
]);

const signedQtySchema = z.union([
  z.number().refine((n) => n !== 0, "Quantity cannot be zero"),
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .refine((v) => Number(v) !== 0, "Quantity cannot be zero"),
]);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

export const syncPullSchema = z.object({
  clientId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  since: z.string().datetime().optional().nullable(),
});

const receiveMutation = z.object({
  clientMutationId: z.string().trim().min(1).max(128),
  type: z.literal("RECEIVE"),
  occurredAt: z.string().datetime().optional(),
  payload: z.object({
    inboundOrderId: z.string().cuid(),
    asnNumber: z.string().trim().min(1),
    lineId: z.string().cuid(),
    binId: z.string().cuid(),
    quantity: qtySchema,
    lotNumber: z.string().trim().max(128).optional().nullable(),
    expiryDate: dateOnlySchema,
    manufactureDate: dateOnlySchema,
  }),
});

const shipMutation = z.object({
  clientMutationId: z.string().trim().min(1).max(128),
  type: z.literal("SHIP"),
  occurredAt: z.string().datetime().optional(),
  payload: z.object({
    outboundOrderId: z.string().cuid(),
    lineId: z.string().cuid(),
    quantity: qtySchema.optional(),
  }),
});

const transferMutation = z.object({
  clientMutationId: z.string().trim().min(1).max(128),
  type: z.literal("TRANSFER"),
  occurredAt: z.string().datetime().optional(),
  payload: z.object({
    skuId: z.string().cuid(),
    fromBinId: z.string().cuid(),
    toBinId: z.string().cuid(),
    quantity: qtySchema,
    lotNumber: z.string().trim().max(128).optional().nullable(),
    expiryDate: dateOnlySchema,
    manufactureDate: dateOnlySchema,
  }),
});

const adjustMutation = z.object({
  clientMutationId: z.string().trim().min(1).max(128),
  type: z.literal("ADJUST"),
  occurredAt: z.string().datetime().optional(),
  payload: z.object({
    skuId: z.string().cuid(),
    binId: z.string().cuid(),
    quantity: signedQtySchema,
    lotNumber: z.string().trim().max(128).optional().nullable(),
    expiryDate: dateOnlySchema,
    manufactureDate: dateOnlySchema,
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
});

export const syncPushSchema = z.object({
  clientId: z.string().cuid(),
  deviceId: z.string().trim().min(1).max(128),
  warehouseId: z.string().cuid(),
  mutations: z
    .array(
      z.discriminatedUnion("type", [
        receiveMutation,
        shipMutation,
        transferMutation,
        adjustMutation,
      ]),
    )
    .min(1)
    .max(500),
});
