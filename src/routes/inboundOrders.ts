import { Router } from "express";
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
import { receiveInboundOrder } from "../services/inbound.js";

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

    const orders = await prisma.inboundOrder.findMany({
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

inboundOrdersRouter.get(
  "/:id",
  validate(inboundIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const order = await prisma.inboundOrder.findUnique({
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

inboundOrdersRouter.post(
  "/",
  validate(createInboundOrderSchema),
  asyncHandler(async (req, res) => {
    try {
      const { lines, expectedAt, ...header } = req.body as {
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
      const data = { ...req.body } as {
        notes?: string | null;
        expectedAt?: string | null;
        status?: "DRAFT" | "OPEN" | "CANCELLED";
      };
      const order = await prisma.inboundOrder.update({
        where: { id: req.params.id as string },
        data: {
          notes: data.notes,
          status: data.status,
          expectedAt:
            data.expectedAt === undefined
              ? undefined
              : data.expectedAt
                ? new Date(data.expectedAt)
                : null,
        },
        include: { lines: true },
      });
      res.json(order);
    } catch (error) {
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
