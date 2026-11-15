import type { NextFunction, Request, Response } from "express";
import type { ApiKey } from "@prisma/client";
import {
  apiKeyHasScope,
  findActiveApiKeyByRaw,
  type ApiScope,
} from "../lib/apiKeys.js";
import { prisma } from "../lib/prisma.js";

export type AuthedRequest = Request & {
  apiKey?: ApiKey;
};

export function requireApiKey(...scopes: ApiScope[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const header =
      (req.header("x-api-key") ?? req.header("authorization") ?? "").trim();
    const raw = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : header;

    if (!raw) {
      res.status(401).json({
        error: "Missing API key",
        message: "Provide X-Api-Key or Authorization: Bearer <key>",
      });
      return;
    }

    try {
      const apiKey = await findActiveApiKeyByRaw(raw);
      if (!apiKey) {
        res.status(401).json({ error: "Invalid API key" });
        return;
      }

      for (const scope of scopes) {
        if (!apiKeyHasScope(apiKey, scope)) {
          res.status(403).json({
            error: "Forbidden",
            message: `API key lacks required scope: ${scope}`,
          });
          return;
        }
      }

      (req as AuthedRequest).apiKey = apiKey;
      void prisma.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => undefined);

      next();
    } catch (error) {
      next(error);
    }
  };
}
