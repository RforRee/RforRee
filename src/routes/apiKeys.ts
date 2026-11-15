import { Router } from "express";
import { generateRawApiKey } from "../lib/apiKeys.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  apiKeyIdParamSchema,
  createApiKeySchema,
} from "../schemas/apiKeys.js";

export const apiKeysRouter = Router();

apiKeysRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const clientId =
      typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const keys = await prisma.apiKey.findMany({
      where: { clientId },
      select: {
        id: true,
        clientId: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(keys);
  }),
);

apiKeysRouter.post(
  "/",
  validate(createApiKeySchema),
  asyncHandler(async (req, res) => {
    try {
      const { clientId, name, scopes } = req.body as {
        clientId: string;
        name: string;
        scopes: string[];
      };
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) {
        res.status(400).json({ error: "clientId not found" });
        return;
      }

      const { rawKey, prefix, hash } = generateRawApiKey();
      const record = await prisma.apiKey.create({
        data: {
          clientId,
          name,
          keyPrefix: prefix,
          keyHash: hash,
          scopes,
        },
        select: {
          id: true,
          clientId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json({
        ...record,
        apiKey: rawKey,
        warning: "Store apiKey now; it will not be shown again.",
      });
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

apiKeysRouter.delete(
  "/:id",
  validate(apiKeyIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    try {
      await prisma.apiKey.update({
        where: { id: req.params.id as string },
        data: { isActive: false },
      });
      res.status(204).send();
    } catch (error) {
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);
