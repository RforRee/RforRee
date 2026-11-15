import { AppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import type {
  ExternalInboundOrder,
  ExternalOrderEnvelope,
  ExternalOutboundOrder,
  InternalInboundCreate,
  InternalOutboundCreate,
} from "./types.js";

/**
 * Adapter Pattern entry point: convert external / EDI-shaped JSON into
 * internal create payloads. Concrete EDI 940/943 parsers can subclass or
 * wrap this later without changing route handlers.
 */
export interface OrderAdapter {
  readonly name: string;
  toInternalInbound(order: ExternalInboundOrder): Promise<InternalInboundCreate>;
  toInternalOutbound(
    order: ExternalOutboundOrder,
  ): Promise<InternalOutboundCreate>;
  fromEnvelope(
    envelope: ExternalOrderEnvelope,
  ): Promise<
    | { kind: "inbound"; data: InternalInboundCreate }
    | { kind: "outbound"; data: InternalOutboundCreate }
  >;
}

async function resolveClientWarehouseSku(params: {
  clientCode: string;
  warehouseCode: string;
  skuCodes: string[];
}) {
  const client = await prisma.client.findUnique({
    where: { code: params.clientCode },
  });
  if (!client) {
    throw new AppError(
      `Unknown clientCode: ${params.clientCode}`,
      400,
      "UNKNOWN_CLIENT",
    );
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: {
      clientId_code: { clientId: client.id, code: params.warehouseCode },
    },
  });
  if (!warehouse) {
    throw new AppError(
      `Unknown warehouseCode: ${params.warehouseCode}`,
      400,
      "UNKNOWN_WAREHOUSE",
    );
  }

  const skus = await prisma.sku.findMany({
    where: {
      clientId: client.id,
      code: { in: [...new Set(params.skuCodes)] },
    },
  });
  const byCode = new Map(skus.map((s) => [s.code, s]));
  for (const code of params.skuCodes) {
    if (!byCode.has(code)) {
      throw new AppError(`Unknown skuCode: ${code}`, 400, "UNKNOWN_SKU");
    }
  }

  return { client, warehouse, byCode };
}

/** Default JSON adapter used by `/api/v1/external/orders`. */
export class JsonOrderAdapter implements OrderAdapter {
  readonly name = "json-v1";

  async toInternalInbound(
    order: ExternalInboundOrder,
  ): Promise<InternalInboundCreate> {
    const { client, warehouse, byCode } = await resolveClientWarehouseSku({
      clientCode: order.clientCode,
      warehouseCode: order.warehouseCode,
      skuCodes: order.lines.map((l) => l.skuCode),
    });

    return {
      clientId: client.id,
      warehouseId: warehouse.id,
      asnNumber: order.documentNumber,
      expectedAt: order.expectedAt ?? null,
      notes: order.notes ?? null,
      status: "OPEN",
      lines: order.lines.map((l) => ({
        skuId: byCode.get(l.skuCode)!.id,
        expectedQty: l.quantity,
        lotNumber: l.lotNumber ?? "",
        expiryDate: l.expiryDate ?? null,
        manufactureDate: l.manufactureDate ?? null,
      })),
    };
  }

  async toInternalOutbound(
    order: ExternalOutboundOrder,
  ): Promise<InternalOutboundCreate> {
    const { client, warehouse, byCode } = await resolveClientWarehouseSku({
      clientCode: order.clientCode,
      warehouseCode: order.warehouseCode,
      skuCodes: order.lines.map((l) => l.skuCode),
    });

    return {
      clientId: client.id,
      warehouseId: warehouse.id,
      orderNumber: order.documentNumber,
      notes: order.notes ?? null,
      status: "OPEN",
      lines: order.lines.map((l) => ({
        skuId: byCode.get(l.skuCode)!.id,
        requestedQty: l.quantity,
        lotNumber: l.lotNumber ?? null,
      })),
    };
  }

  async fromEnvelope(envelope: ExternalOrderEnvelope) {
    if (
      envelope.documentType === "INBOUND" ||
      envelope.documentType === "ASN" ||
      envelope.documentType === "EDI_943"
    ) {
      return {
        kind: "inbound" as const,
        data: await this.toInternalInbound(envelope.order),
      };
    }
    return {
      kind: "outbound" as const,
      data: await this.toInternalOutbound(envelope.order),
    };
  }
}

/**
 * Stub for future X12 EDI 940 (Warehouse Shipping Order) / 943 (Warehouse
 * Stock Transfer Shipment Advice) parsers. Maps into the same external DTOs
 * then reuses JsonOrderAdapter resolution.
 */
export class Edi940943Adapter implements OrderAdapter {
  readonly name = "edi-940-943-stub";
  private readonly inner = new JsonOrderAdapter();

  async toInternalInbound(order: ExternalInboundOrder) {
    // Future: parse EDI segments → ExternalInboundOrder, then:
    return this.inner.toInternalInbound(order);
  }

  async toInternalOutbound(order: ExternalOutboundOrder) {
    return this.inner.toInternalOutbound(order);
  }

  async fromEnvelope(envelope: ExternalOrderEnvelope) {
    return this.inner.fromEnvelope(envelope);
  }
}

/** Factory so routes stay decoupled from concrete adapters. */
export function getOrderAdapter(
  format: "json" | "edi" = "json",
): OrderAdapter {
  if (format === "edi") return new Edi940943Adapter();
  return new JsonOrderAdapter();
}

export const defaultOrderAdapter = new JsonOrderAdapter();
