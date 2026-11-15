import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createZoneSchema,
  updateZoneSchema,
  zoneIdParamSchema,
} from "../schemas/zone.js";

export const zonesRouter = Router();

zonesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const warehouseId =
      typeof req.query.warehouseId === "string"
        ? req.query.warehouseId
        : undefined;
    const zones = await prisma.zone.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      orderBy: { code: "asc" },
    });
    res.json(zones);
  }),
);

zonesRouter.get(
  "/:id",
  validate(zoneIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.findUnique({
      where: { id: req.params.id as string },
      include: {
        _count: { select: { bins: true } },
      },
    });
    if (!zone) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(zone);
  }),
);

zonesRouter.post(
  "/",
  validate(createZoneSchema),
  asyncHandler(async (req, res) => {
    try {
      const zone = await prisma.zone.create({ data: req.body });
      res.status(201).json(zone);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

zonesRouter.patch(
  "/:id",
  validate(zoneIdParamSchema, "params"),
  validate(updateZoneSchema),
  asyncHandler(async (req, res) => {
    try {
      const zone = await prisma.zone.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json(zone);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

zonesRouter.delete(
  "/:id",
  validate(zoneIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.zone.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

zonesRouter.get(
  "/:id/bins",
  validate(zoneIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const zone = await prisma.zone.findUnique({
      where: { id: req.params.id as string },
      select: { id: true },
    });
    if (!zone) {
      res.status(404).json({ error: "Zone not found" });
      return;
    }
    const bins = await prisma.bin.findMany({
      where: { zoneId: zone.id },
      orderBy: { code: "asc" },
    });
    res.json(bins);
  }),
);
