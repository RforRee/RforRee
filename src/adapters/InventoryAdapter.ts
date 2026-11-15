import { AppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import type { ExternalInventoryQuery } from "./types.js";

export type InternalInventoryFilter = {
  clientId: string;
  warehouseId?: string;
  skuId?: string;
  lotNumber?: string;
};

export interface InventoryQueryAdapter {
  readonly name: string;
  toInternalFilter(query: ExternalInventoryQuery): Promise<InternalInventoryFilter>;
}

export class JsonInventoryQueryAdapter implements InventoryQueryAdapter {
  readonly name = "json-v1";

  async toInternalFilter(
    query: ExternalInventoryQuery,
  ): Promise<InternalInventoryFilter> {
    const client = await prisma.client.findUnique({
      where: { code: query.clientCode },
    });
    if (!client) {
      throw new AppError(
        `Unknown clientCode: ${query.clientCode}`,
        400,
        "UNKNOWN_CLIENT",
      );
    }

    let warehouseId: string | undefined;
    if (query.warehouseCode) {
      const warehouse = await prisma.warehouse.findUnique({
        where: {
          clientId_code: {
            clientId: client.id,
            code: query.warehouseCode,
          },
        },
      });
      if (!warehouse) {
        throw new AppError(
          `Unknown warehouseCode: ${query.warehouseCode}`,
          400,
          "UNKNOWN_WAREHOUSE",
        );
      }
      warehouseId = warehouse.id;
    }

    let skuId: string | undefined;
    if (query.skuCode) {
      const sku = await prisma.sku.findUnique({
        where: {
          clientId_code: { clientId: client.id, code: query.skuCode },
        },
      });
      if (!sku) {
        throw new AppError(
          `Unknown skuCode: ${query.skuCode}`,
          400,
          "UNKNOWN_SKU",
        );
      }
      skuId = sku.id;
    }

    return {
      clientId: client.id,
      warehouseId,
      skuId,
      lotNumber: query.lotNumber,
    };
  }
}

export const defaultInventoryQueryAdapter = new JsonInventoryQueryAdapter();
