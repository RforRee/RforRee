import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { isAppError } from "../errors.js";
import { toDateOnly } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createInboundOrderSchema,
  inboundIdParamSchema,
  receiveInboundSchema,
  updateInboundOrderSchema,
} from "../schemas/inbound.js";
import { getInboundOrderDetail } from "../services/orderDetail.js";
import {
  buildInboundTemplate,
  importInboundFromExcel,
} from "../services/orderImport.js";
import { receiveInboundOrder } from "../services/inbound.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const inboundOrdersRouter = Router();

inboundOrdersRouter.get(
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

    const orders = await prisma.inboundOrder.findMany({
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

inboundOrdersRouter.get(
  "/import/template",
  asyncHandler(async (_req, res) => {
    const buffer = buildInboundTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="inbound-order-template.xlsx"',
    );
    res.send(buffer);
  }),
);

inboundOrdersRouter.post(
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
      const result = await importInboundFromExcel({
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

inboundOrdersRouter.get(
  "/:id",
  validate(inboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      const detail = await getInboundOrderDetail(req.params.id as string);
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

inboundOrdersRouter.post(
  "/",
  validate(createInboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const { lines, expectedAt, source, externalRef, ...header } = req.body as {
        lines: Array<{
          skuId: string;
          expectedQty: number | string;
          lotNumber?: string | null;
          expiryDate?: string | null;
          manufactureDate?: string | null;
        }>;
        expectedAt?: string | null;
        clientId: string;
        warehouseId: string;
        asnNumber: string;
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

      const order = await prisma.inboundOrder.create({
        data: {
          ...header,
          source: source ?? "MANUAL",
          externalRef: externalRef ?? null,
          expectedAt: expectedAt ? new Date(expectedAt) : null,
          lines: {
            create: lines.map((l) => ({
              skuId: l.skuId,
              expectedQty: new Prisma.Decimal(l.expectedQty),
              lotNumber: (l.lotNumber ?? "").trim(),
              expiryDate: toDateOnly(l.expiryDate),
              manufactureDate: toDateOnly(l.manufactureDate),
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

inboundOrdersRouter.patch(
  "/:id",
  validate(inboundIdParamSchema, "params"),
  validate(updateInboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.inboundOrder.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        existing.status === "COMPLETED" ||
        existing.status === "CANCELLED"
      ) {
        res.status(409).json({
          error: `Cannot edit order in status ${existing.status}`,
        });
        return;
      }

      const data = req.body as {
        notes?: string | null;
        expectedAt?: string | null;
        status?: "DRAFT" | "OPEN" | "CANCELLED";
        externalRef?: string | null;
        lines?: Array<{
          id?: string;
          skuId?: string;
          expectedQty?: number | string;
          lotNumber?: string | null;
          expiryDate?: string | null;
          manufactureDate?: string | null;
          _delete?: boolean;
        }>;
      };

      await prisma.$transaction(async (tx) => {
        await tx.inboundOrder.update({
          where: { id },
          data: {
            notes: data.notes,
            status: data.status,
            externalRef: data.externalRef,
            expectedAt:
              data.expectedAt === undefined
                ? undefined
                : data.expectedAt
                  ? new Date(data.expectedAt)
                  : null,
          },
        });

        if (data.lines) {
          for (const line of data.lines) {
            if (line.id && line._delete) {
              const current = existing.lines.find((l) => l.id === line.id);
              if (current && Number(current.receivedQty) > 0) {
                throw Object.assign(
                  new Error("Cannot delete a line that already has receipts"),
                  { statusCode: 409 },
                );
              }
              await tx.inboundOrderLine.delete({ where: { id: line.id } });
              continue;
            }
            if (line.id) {
              const current = existing.lines.find((l) => l.id === line.id);
              if (
                current &&
                line.expectedQty != null &&
                Number(line.expectedQty) < Number(current.receivedQty)
              ) {
                throw Object.assign(
                  new Error(
                    `expectedQty cannot be less than receivedQty (${current.receivedQty})`,
                  ),
                  { statusCode: 409 },
                );
              }
              await tx.inboundOrderLine.update({
                where: { id: line.id },
                data: {
                  expectedQty:
                    line.expectedQty != null
                      ? new Prisma.Decimal(line.expectedQty)
                      : undefined,
                  lotNumber:
                    line.lotNumber === undefined
                      ? undefined
                      : (line.lotNumber ?? "").trim(),
                  expiryDate:
                    line.expiryDate === undefined
                      ? undefined
                      : toDateOnly(line.expiryDate),
                  manufactureDate:
                    line.manufactureDate === undefined
                      ? undefined
                      : toDateOnly(line.manufactureDate),
                },
              });
            } else if (line.skuId && line.expectedQty != null) {
              await tx.inboundOrderLine.create({
                data: {
                  inboundOrderId: id,
                  skuId: line.skuId,
                  expectedQty: new Prisma.Decimal(line.expectedQty),
                  lotNumber: (line.lotNumber ?? "").trim(),
                  expiryDate: toDateOnly(line.expiryDate),
                  manufactureDate: toDateOnly(line.manufactureDate),
                },
              });
            }
          }
        }
      });

      const detail = await getInboundOrderDetail(id);
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

inboundOrdersRouter.delete(
  "/:id",
  validate(inboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      const existing = await prisma.inboundOrder.findUnique({
        where: { id: req.params.id as string },
      });
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (existing.status !== "DRAFT" && existing.status !== "CANCELLED") {
        res.status(409).json({
          error: "Only DRAFT or CANCELLED inbound orders can be deleted",
        });
        return;
      }
      await prisma.inboundOrder.delete({
        where: { id: req.params.id as string },
      });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

inboundOrdersRouter.post(
  "/:id/receive",
  validate(inboundIdParamSchema, "params"),
  validate(receiveInboundSchema),
  asyncHandler(async (req, res) => {
    try {
      const result = await receiveInboundOrder(
        req.params.id as string,
        req.body,
      );
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
