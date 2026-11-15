import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  createClientSchema,
  idParamSchema,
  updateClientSchema,
} from "../schemas/client.js";

export const clientsRouter = Router();

clientsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const clients = await prisma.client.findMany({
      orderBy: { code: "asc" },
    });
    res.json(clients);
  }),
);

clientsRouter.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id as string },
      include: {
        _count: { select: { warehouses: true, skus: true } },
      },
    });
    if (!client) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(client);
  }),
);

clientsRouter.post(
  "/",
  validate(createClientSchema),
  asyncHandler(async (req, res) => {
    try {
      const client = await prisma.client.create({ data: req.body });
      res.status(201).json(client);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

clientsRouter.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateClientSchema),
  asyncHandler(async (req, res) => {
    try {
      const client = await prisma.client.update({
        where: { id: req.params.id as string },
        data: req.body,
      });
      res.json(client);
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

clientsRouter.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.client.delete({ where: { id: req.params.id as string } });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

clientsRouter.get(
  "/:id/warehouses",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id as string },
      select: { id: true },
    });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const warehouses = await prisma.warehouse.findMany({
      where: { clientId: client.id },
      orderBy: { code: "asc" },
    });
    res.json(warehouses);
  }),
);

clientsRouter.get(
  "/:id/skus",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id as string },
      select: { id: true },
    });
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    const skus = await prisma.sku.findMany({
      where: { clientId: client.id },
      orderBy: { code: "asc" },
    });
    res.json(skus);
  }),
);
