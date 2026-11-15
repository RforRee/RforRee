import { z } from "zod";
import { ALL_SCOPES } from "../lib/apiKeys.js";

export const createApiKeySchema = z.object({
  clientId: z.string().cuid(),
  name: z.string().trim().min(1).max(128),
  scopes: z
    .array(z.enum([...ALL_SCOPES, "*"] as [string, ...string[]]))
    .min(1)
    .default([...ALL_SCOPES]),
});

export const apiKeyIdParamSchema = z.object({
  id: z.string().cuid(),
});
