import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  binIdParamSchema,
  createBinSchema,
  updateBinSchema,
} from "../schemas/bin.js";

export const binsRouter = Router();

binsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const zoneId =
      typeof req.query.zoneId === "string" ? req.query.zoneId : undefined;
    const bins = await prisma.bin.findMany({
      where: zoneId ? { zoneId } : undefined,
      orderBy: { code: "asc" },
    });
    res.json(bins);
  }),
);

binsRouter.get(
  "/:id",
  validate(binIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const bin = await prisma.bin.findUnique({
      where: { id: req.params.id as string },
    });
    if (!bin) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(bin);
  }),
);

binsRouter.post(
  "/",
  validate(createBinSchema),
  asyncHandler(async (req, res) => {
    try {
      const bin = await prisma.bin.create({ data: req.body });
      res.status(201).json(bin);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

binsRouter.patch(
  "/:id",
  validate(binIdParamSchema, "params"),
  validate(updateBinSchema),
  asyncHandler(async (req, res) => {
    try {
      const bin = await prisma.bin.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json(bin);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

binsRouter.delete(
  "/:id",
  validate(binIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.bin.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);
