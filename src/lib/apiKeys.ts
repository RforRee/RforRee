import { createHash, randomBytes } from "node:crypto";
import type { ApiKey } from "@prisma/client";
import { prisma } from "./prisma.js";

export const ALL_SCOPES = [
  "sync:pull",
  "sync:push",
  "external:inventory",
  "external:orders",
] as const;

export type ApiScope = (typeof ALL_SCOPES)[number];

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a raw key `wms_<32 hex bytes>`; caller must persist only the hash. */
export function generateRawApiKey(): { rawKey: string; prefix: string; hash: string } {
  const rawKey = `wms_${randomBytes(24).toString("hex")}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 12),
    hash: hashApiKey(rawKey),
  };
}

export function apiKeyHasScope(apiKey: ApiKey, scope: ApiScope): boolean {
  return apiKey.scopes.includes(scope) || apiKey.scopes.includes("*");
}

export async function findActiveApiKeyByRaw(
  rawKey: string,
): Promise<ApiKey | null> {
  const keyHash = hashApiKey(rawKey);
  const key = await prisma.apiKey.findUnique({ where: { keyHash } });
  if (!key || !key.isActive) return null;
  return key;
}
