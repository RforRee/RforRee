import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { isAppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createOutboundOrderSchema,
  outboundIdParamSchema,
  shipOutboundSchema,
  updateOutboundOrderSchema,
} from "../schemas/outbound.js";
import { getOutboundOrderDetail } from "../services/orderDetail.js";
import {
  buildOutboundTemplate,
  importOutboundFromExcel,
} from "../services/orderImport.js";
import { shipOutboundOrder } from "../services/outbound.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const outboundOrdersRouter = Router();

outboundOrdersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const warehouseId =
      typeof req.query.warehouseId === "string"
        ? req.query.warehouseId
        : undefined;
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const source =
      typeof req.query.source === "string" ? req.query.source : undefined;

    const orders = await prisma.outboundOrder.findMany({
      where: {
        clientId,
        warehouseId,
        status: status as never,
        source,
      },
      include: {
        lines: { include: { sku: { select: { code: true, name: true } } } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders);
  }),
);

outboundOrdersRouter.get(
  "/import/template",
  asyncHandler(async (_req, res) => {
    const buffer = buildOutboundTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="outbound-order-template.xlsx"',
    );
    res.send(buffer);
  }),
);

outboundOrdersRouter.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const clientId =
      typeof req.body.clientId === "string" ? req.body.clientId : undefined;
    if (!clientId) {
      res.status(400).json({ error: "clientId is required" });
      return;
    }
    if (!req.file?.buffer) {
      res.status(400).json({ error: "Excel file is required (field: file)" });
      return;
    }
    try {
      const result = await importOutboundFromExcel({
        clientId,
        buffer: req.file.buffer,
      });
      const status = result.errorCount && !result.createdCount ? 400 : 201;
      res.status(status).json(result);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);

outboundOrdersRouter.get(
  "/:id",
  validate(outboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      const detail = await getOutboundOrderDetail(req.params.id as string);
      res.json(detail);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);

outboundOrdersRouter.post(
  "/",
  validate(createOutboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const { lines, source, externalRef, ...header } = req.body as {
        lines: Array<{
          skuId: string;
          requestedQty: number | string;
          lotNumber?: string | null;
        }>;
        clientId: string;
        warehouseId: string;
        orderNumber: string;
        notes?: string | null;
        status?: "DRAFT" | "OPEN";
        source?: "MANUAL" | "API" | "IMPORT";
        externalRef?: string | null;
      };

      const warehouse = await prisma.warehouse.findUnique({
        where: { id: header.warehouseId },
      });
      if (!warehouse || warehouse.clientId !== header.clientId) {
        res.status(400).json({
          error: "warehouseId must belong to the given clientId",
        });
        return;
      }

      const order = await prisma.outboundOrder.create({
        data: {
          ...header,
          source: source ?? "MANUAL",
          externalRef: externalRef ?? null,
          lines: {
            create: lines.map((l) => ({
              skuId: l.skuId,
              requestedQty: new Prisma.Decimal(l.requestedQty),
              lotNumber:
                l.lotNumber == null || l.lotNumber === ""
                  ? null
                  : l.lotNumber.trim(),
            })),
          },
        },
        include: { lines: true },
      });
      res.status(201).json(order);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

outboundOrdersRouter.patch(
  "/:id",
  validate(outboundIdParamSchema, "params"),
  validate(updateOutboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.outboundOrder.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status === "SHIPPED" || existing.status === "CANCELLED") {
        res.status(409).json({
          error: `Cannot edit order in status ${existing.status}`,
        });
        return;
      }

      const data = req.body as {
        notes?: string | null;
        status?: "DRAFT" | "OPEN" | "CANCELLED";
        externalRef?: string | null;
        lines?: Array<{
          id?: string;
          skuId?: string;
          requestedQty?: number | string;
          lotNumber?: string | null;
          _delete?: boolean;
        }>;
      };

      await prisma.$transaction(async (tx) => {
        await tx.outboundOrder.update({
          where: { id },
          data: {
            notes: data.notes,
            status: data.status,
            externalRef: data.externalRef,
          },
        });

        if (data.lines) {
          for (const line of data.lines) {
            if (line.id && line._delete) {
              const current = existing.lines.find((l) => l.id === line.id);
              if (current && Number(current.shippedQty) > 0) {
                throw Object.assign(
                  new Error("Cannot delete a line that already has shipments"),
                  { statusCode: 409 },
                );
              }
              await tx.outboundOrderLine.delete({ where: { id: line.id } });
              continue;
            }
            if (line.id) {
              const current = existing.lines.find((l) => l.id === line.id);
              if (
                current &&
                line.requestedQty != null &&
                Number(line.requestedQty) < Number(current.shippedQty)
              ) {
                throw Object.assign(
                  new Error(
                    `requestedQty cannot be less than shippedQty (${current.shippedQty})`,
                  ),
                  { statusCode: 409 },
                );
              }
              await tx.outboundOrderLine.update({
                where: { id: line.id },
                data: {
                  requestedQty:
                    line.requestedQty != null
                      ? new Prisma.Decimal(line.requestedQty)
                      : undefined,
                  lotNumber:
                    line.lotNumber === undefined
                      ? undefined
                      : line.lotNumber === "" || line.lotNumber == null
                        ? null
                        : line.lotNumber.trim(),
                },
              });
            } else if (line.skuId && line.requestedQty != null) {
              await tx.outboundOrderLine.create({
                data: {
                  outboundOrderId: id,
                  skuId: line.skuId,
                  requestedQty: new Prisma.Decimal(line.requestedQty),
                  lotNumber:
                    line.lotNumber == null || line.lotNumber === ""
                      ? null
                      : line.lotNumber.trim(),
                },
              });
            }
          }
        }
      });

      const detail = await getOutboundOrderDetail(id);
      res.json(detail);
    } catch (error) {
      if (
        typeof error === "object" &&
        error &&
        "statusCode" in error &&
        typeof (error as { statusCode: unknown }).statusCode === "number"
      ) {
        const err = error as { statusCode: number; message?: string };
        res.status(err.statusCode).json({
          error: err.message ?? "Conflict",
        });
        return;
      }
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

outboundOrdersRouter.delete(
  "/:id",
  validate(outboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      const existing = await prisma.outboundOrder.findUnique({
        where: { id: req.params.id as string },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status !== "DRAFT" && existing.status !== "CANCELLED") {
        res.status(409).json({
          error: "Only DRAFT or CANCELLED outbound orders can be deleted",
        });
        return;
      }
      await prisma.outboundOrder.delete({
        where: { id: req.params.id as string },
      });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

outboundOrdersRouter.post(
  "/:id/ship",
  validate(outboundIdParamSchema, "params"),
  validate(shipOutboundSchema),
  asyncHandler(async (req, res) => {
    try {
      const result = await shipOutboundOrder(req.params.id as string, req.body);
      res.json(result);
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);
