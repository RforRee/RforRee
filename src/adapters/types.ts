/**
 * External / EDI-facing DTOs. Adapters map these into internal Prisma shapes
 * so ERP / e-commerce / EDI 940–945 connectors stay swappable.
 */

export type ExternalInventoryQuery = {
  /** Client / trading-partner code (not internal cuid). */
  clientCode: string;
  warehouseCode?: string;
  skuCode?: string;
  lotNumber?: string;
};

export type ExternalOrderLine = {
  skuCode: string;
  quantity: number | string;
  lotNumber?: string | null;
  expiryDate?: string | null;
  manufactureDate?: string | null;
  uom?: string | null;
};

export type ExternalInboundOrder = {
  clientCode: string;
  warehouseCode: string;
  /** Maps to ASN / shipment ID (EDI 943-ish). */
  documentNumber: string;
  expectedAt?: string | null;
  notes?: string | null;
  lines: ExternalOrderLine[];
};

export type ExternalOutboundOrder = {
  clientCode: string;
  warehouseCode: string;
  /** Maps to ship order / EDI 940 warehouse shipping order. */
  documentNumber: string;
  notes?: string | null;
  lines: ExternalOrderLine[];
};

export type ExternalOrderEnvelope =
  | { documentType: "INBOUND" | "ASN" | "EDI_943"; order: ExternalInboundOrder }
  | {
      documentType: "OUTBOUND" | "SHIP_ORDER" | "EDI_940";
      order: ExternalOutboundOrder;
    };

export type InternalInboundCreate = {
  clientId: string;
  warehouseId: string;
  asnNumber: string;
  expectedAt?: string | null;
  notes?: string | null;
  status: "OPEN";
  lines: Array<{
    skuId: string;
    expectedQty: number | string;
    lotNumber?: string | null;
    expiryDate?: string | null;
    manufactureDate?: string | null;
  }>;
};

export type InternalOutboundCreate = {
  clientId: string;
  warehouseId: string;
  orderNumber: string;
  notes?: string | null;
  status: "OPEN";
  lines: Array<{
    skuId: string;
    requestedQty: number | string;
    lotNumber?: string | null;
  }>;
};
