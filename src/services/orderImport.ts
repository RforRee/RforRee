import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors.js";
import { toDateOnly } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";

type InboundRow = {
  asnNumber: string;
  warehouseCode: string;
  skuCode: string;
  expectedQty: number | string;
  lotNumber?: string;
  expiryDate?: string;
  manufactureDate?: string;
  notes?: string;
};

type OutboundRow = {
  orderNumber: string;
  warehouseCode: string;
  skuCode: string;
  requestedQty: number | string;
  lotNumber?: string;
  notes?: string;
};

function sheetToRows<T extends Record<string, unknown>>(buffer: Buffer): T[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new AppError("Excel file has no sheets", 400);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) throw new AppError("Excel sheet is empty", 400);
  return rows.map((r) => normalizeKeys(r)) as T[];
}

function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.trim().replace(/\s+/g, "");
    const camel =
      key.charAt(0).toLowerCase() +
      key
        .slice(1)
        .replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase());
    // Map common header aliases
    const aliases: Record<string, string> = {
      asn: "asnNumber",
      asnnumber: "asnNumber",
      asnno: "asnNumber",
      orderno: "orderNumber",
      ordernumber: "orderNumber",
      warehouse: "warehouseCode",
      warehousecode: "warehouseCode",
      sku: "skuCode",
      skucode: "skuCode",
      qty: "expectedQty",
      quantity: "expectedQty",
      expectedqty: "expectedQty",
      requestedqty: "requestedQty",
      lot: "lotNumber",
      lotnumber: "lotNumber",
      lotno: "lotNumber",
      ed: "expiryDate",
      expiry: "expiryDate",
      expirydate: "expiryDate",
      md: "manufactureDate",
      manufacturedate: "manufactureDate",
      note: "notes",
      notes: "notes",
    };
    const normalized = aliases[camel.toLowerCase()] || camel;
    out[normalized] = typeof v === "string" ? v.trim() : v;
  }
  return out;
}

function excelDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function buildInboundTemplate(): Buffer {
  const rows = [
    {
      asnNumber: "ASN-EXAMPLE-001",
      warehouseCode: "WH1",
      skuCode: "SKU-100",
      expectedQty: 10,
      lotNumber: "LOT-A",
      expiryDate: "2027-12-31",
      manufactureDate: "2026-01-15",
      notes: "Sample inbound import",
    },
    {
      asnNumber: "ASN-EXAMPLE-001",
      warehouseCode: "WH1",
      skuCode: "SKU-200",
      expectedQty: 5,
      lotNumber: "",
      expiryDate: "",
      manufactureDate: "",
      notes: "",
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Inbound");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildOutboundTemplate(): Buffer {
  const rows = [
    {
      orderNumber: "SO-EXAMPLE-001",
      warehouseCode: "WH1",
      skuCode: "SKU-100",
      requestedQty: 3,
      lotNumber: "",
      notes: "Sample outbound import",
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Outbound");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function importInboundFromExcel(params: {
  clientId: string;
  buffer: Buffer;
}) {
  const raw = sheetToRows<InboundRow>(params.buffer);
  const groups = new Map<string, InboundRow[]>();
  for (const row of raw) {
    if (!row.asnNumber || !row.warehouseCode || !row.skuCode) {
      throw new AppError(
        "Each row needs asnNumber, warehouseCode, and skuCode",
        400,
        "IMPORT_INVALID_ROW",
      );
    }
    const key = String(row.asnNumber);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const created = [];
  const errors: Array<{ asnNumber: string; error: string }> = [];

  for (const [asnNumber, rows] of groups) {
    try {
      const warehouseCode = String(rows[0].warehouseCode);
      const warehouse = await prisma.warehouse.findUnique({
        where: {
          clientId_code: { clientId: params.clientId, code: warehouseCode },
        },
      });
      if (!warehouse) {
        throw new AppError(`Unknown warehouseCode: ${warehouseCode}`, 400);
      }

      const skuCodes = rows.map((r) => String(r.skuCode));
      const skus = await prisma.sku.findMany({
        where: { clientId: params.clientId, code: { in: skuCodes } },
      });
      const byCode = new Map(skus.map((s) => [s.code, s]));
      for (const code of skuCodes) {
        if (!byCode.has(code)) {
          throw new AppError(`Unknown skuCode: ${code}`, 400);
        }
      }

      const order = await prisma.inboundOrder.create({
        data: {
          clientId: params.clientId,
          warehouseId: warehouse.id,
          asnNumber,
          status: "OPEN",
          source: "IMPORT",
          notes: rows[0].notes ? String(rows[0].notes) : null,
          lines: {
            create: rows.map((r) => ({
              skuId: byCode.get(String(r.skuCode))!.id,
              expectedQty: new Prisma.Decimal(r.expectedQty),
              lotNumber: r.lotNumber ? String(r.lotNumber) : "",
              expiryDate: toDateOnly(excelDate(r.expiryDate)),
              manufactureDate: toDateOnly(excelDate(r.manufactureDate)),
            })),
          },
        },
        include: { lines: { include: { sku: true } }, warehouse: true },
      });
      created.push(order);
    } catch (e) {
      errors.push({
        asnNumber,
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }

  return {
    createdCount: created.length,
    errorCount: errors.length,
    orders: created,
    errors,
  };
}

export async function importOutboundFromExcel(params: {
  clientId: string;
  buffer: Buffer;
}) {
  const raw = sheetToRows<OutboundRow>(params.buffer);
  const groups = new Map<string, OutboundRow[]>();
  for (const row of raw) {
    if (!row.orderNumber || !row.warehouseCode || !row.skuCode) {
      throw new AppError(
        "Each row needs orderNumber, warehouseCode, and skuCode",
        400,
        "IMPORT_INVALID_ROW",
      );
    }
    const key = String(row.orderNumber);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const created = [];
  const errors: Array<{ orderNumber: string; error: string }> = [];

  for (const [orderNumber, rows] of groups) {
    try {
      const warehouseCode = String(rows[0].warehouseCode);
      const warehouse = await prisma.warehouse.findUnique({
        where: {
          clientId_code: { clientId: params.clientId, code: warehouseCode },
        },
      });
      if (!warehouse) {
        throw new AppError(`Unknown warehouseCode: ${warehouseCode}`, 400);
      }

      const skuCodes = rows.map((r) => String(r.skuCode));
      const skus = await prisma.sku.findMany({
        where: { clientId: params.clientId, code: { in: skuCodes } },
      });
      const byCode = new Map(skus.map((s) => [s.code, s]));
      for (const code of skuCodes) {
        if (!byCode.has(code)) {
          throw new AppError(`Unknown skuCode: ${code}`, 400);
        }
      }

      const order = await prisma.outboundOrder.create({
        data: {
          clientId: params.clientId,
          warehouseId: warehouse.id,
          orderNumber,
          status: "OPEN",
          source: "IMPORT",
          notes: rows[0].notes ? String(rows[0].notes) : null,
          lines: {
            create: rows.map((r) => {
              const qtyRaw =
                (r as { requestedQty?: unknown; expectedQty?: unknown })
                  .requestedQty ??
                (r as { expectedQty?: unknown }).expectedQty ??
                "0";
              return {
                skuId: byCode.get(String(r.skuCode))!.id,
                requestedQty: new Prisma.Decimal(String(qtyRaw)),
                lotNumber: r.lotNumber ? String(r.lotNumber) : null,
              };
            }),
          },
        },
        include: { lines: { include: { sku: true } }, warehouse: true },
      });
      created.push(order);
    } catch (e) {
      errors.push({
        orderNumber,
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }

  return {
    createdCount: created.length,
    errorCount: errors.length,
    orders: created,
    errors,
  };
}
