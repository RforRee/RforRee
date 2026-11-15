import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseIdParamSchema,
} from "../schemas/warehouse.js";

export const warehousesRouter = Router();

warehousesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const warehouses = await prisma.warehouse.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { code: "asc" },
    });
    res.json(warehouses);
  }),
);

warehousesRouter.get(
  "/:id",
  validate(warehouseIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: req.params.id as string },
      include: {
        _count: { select: { zones: true } },
      },
    });
    if (!warehouse) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(warehouse);
  }),
);

warehousesRouter.post(
  "/",
  validate(createWarehouseSchema),
  asyncHandler(async (req, res) => {
    try {
      const warehouse = await prisma.warehouse.create({ data: req.body });
      res.status(201).json(warehouse);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

warehousesRouter.patch(
  "/:id",
  validate(warehouseIdParamSchema, "params"),
  validate(updateWarehouseSchema),
  asyncHandler(async (req, res) => {
    try {
      const warehouse = await prisma.warehouse.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json(warehouse);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

warehousesRouter.delete(
  "/:id",
  validate(warehouseIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.warehouse.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

warehousesRouter.get(
  "/:id/zones",
  validate(warehouseIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: req.params.id as string },
      select: { id: true },
    });
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" });
      return;
    }
    const zones = await prisma.zone.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: { code: "asc" },
    });
    res.json(zones);
  }),
);
