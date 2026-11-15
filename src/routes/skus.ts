import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createSkuSchema,
  skuIdParamSchema,
  updateSkuSchema,
} from "../schemas/sku.js";

export const skusRouter = Router();

skusRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const skus = await prisma.sku.findMany({
      where: clientId ? { clientId } : undefined,
      orderBy: { code: "asc" },
    });
    res.json(skus);
  }),
);

skusRouter.get(
  "/:id",
  validate(skuIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const sku = await prisma.sku.findUnique({
      where: { id: req.params.id as string },
    });
    if (!sku) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(sku);
  }),
);

skusRouter.post(
  "/",
  validate(createSkuSchema),
  asyncHandler(async (req, res) => {
    try {
      const sku = await prisma.sku.create({ data: req.body });
      res.status(201).json(sku);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

skusRouter.patch(
  "/:id",
  validate(skuIdParamSchema, "params"),
  validate(updateSkuSchema),
  asyncHandler(async (req, res) => {
    try {
      const sku = await prisma.sku.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json(sku);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

skusRouter.delete(
  "/:id",
  validate(skuIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.sku.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);
