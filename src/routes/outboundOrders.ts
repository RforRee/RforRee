import { Router } from "express";
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
import { shipOutboundOrder } from "../services/outbound.js";

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

    const orders = await prisma.outboundOrder.findMany({
      where: {
        clientId,
        warehouseId,
        status: status as never,
      },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders);
  }),
);

outboundOrdersRouter.get(
  "/:id",
  validate(outboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const order = await prisma.outboundOrder.findUnique({
      where: { id: req.params.id as string },
      include: { lines: true },
    });
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(order);
  }),
);

outboundOrdersRouter.post(
  "/",
  validate(createOutboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const { lines, ...header } = req.body as {
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
      const order = await prisma.outboundOrder.update({
        where: { id: req.params.id as string },
        data: req.body,
        include: { lines: true },
      });
      res.json(order);
    } catch (error) {
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
