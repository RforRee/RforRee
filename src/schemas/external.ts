import { z } from "zod";

const qtySchema = z.union([
  z.number().positive(),
  z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((v) => Number(v) > 0, "Quantity must be positive"),
]);

const lineSchema = z.object({
  skuCode: z.string().trim().min(1).max(64),
  quantity: qtySchema,
  lotNumber: z.string().trim().max(128).optional().nullable(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  manufactureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  uom: z.string().trim().max(32).optional().nullable(),
});

export const externalInventoryQuerySchema = z.object({
  clientCode: z.string().trim().min(1).max(64),
  warehouseCode: z.string().trim().min(1).max(64).optional(),
  skuCode: z.string().trim().min(1).max(64).optional(),
  lotNumber: z.string().trim().max(128).optional(),
});

const inboundOrderSchema = z.object({
  clientCode: z.string().trim().min(1).max(64),
  warehouseCode: z.string().trim().min(1).max(64),
  documentNumber: z.string().trim().min(1).max(64),
  expectedAt: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const outboundOrderSchema = z.object({
  clientCode: z.string().trim().min(1).max(64),
  warehouseCode: z.string().trim().min(1).max(64),
  documentNumber: z.string().trim().min(1).max(64),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export const externalOrderEnvelopeSchema = z.discriminatedUnion(
  "documentType",
  [
    z.object({
      documentType: z.enum(["INBOUND", "ASN", "EDI_943"]),
      format: z.enum(["json", "edi"]).optional(),
      order: inboundOrderSchema,
    }),
    z.object({
      documentType: z.enum(["OUTBOUND", "SHIP_ORDER", "EDI_940"]),
      format: z.enum(["json", "edi"]).optional(),
      order: outboundOrderSchema,
    }),
  ],
);
