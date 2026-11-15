import { Router } from "express";
import { Prisma } from "@prisma/client";
import { defaultInventoryQueryAdapter } from "../adapters/InventoryAdapter.js";
import { getOrderAdapter } from "../adapters/OrderAdapter.js";
import { isAppError } from "../errors.js";
import { toDateOnly } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, handlePrismaError, validate } from "../lib/validate.js";
import {
  requireApiKey,
  type AuthedRequest,
} from "../middleware/apiKeyAuth.js";
import {
  externalInventoryQuerySchema,
  externalOrderEnvelopeSchema,
} from "../schemas/external.js";

export const externalRouter = Router();

externalRouter.post(
  "/inventory-query",
  requireApiKey("external:inventory"),
  validate(externalInventoryQuerySchema),
  asyncHandler(async (req, res) => {
    try {
      const apiKey = (req as AuthedRequest).apiKey!;
      const filter = await defaultInventoryQueryAdapter.toInternalFilter(
        req.body,
      );
      if (filter.clientId !== apiKey.clientId) {
        res.status(403).json({
          error: "clientCode does not match API key client",
        });
        return;
      }

      const balances = await prisma.inventoryBalance.findMany({
        where: {
          clientId: filter.clientId,
          skuId: filter.skuId,
          lotNumber: filter.lotNumber,
          ...(filter.warehouseId
            ? { bin: { zone: { warehouseId: filter.warehouseId } } }
            : {}),
        },
        include: {
          sku: { select: { code: true, name: true, uom: true } },
          bin: {
            select: {
              code: true,
              barcode: true,
              zone: {
                select: {
                  code: true,
                  warehouse: { select: { code: true } },
                },
              },
            },
          },
        },
        orderBy: [{ skuId: "asc" }, { expiryDate: "asc" }],
      });

      res.json({
        adapter: defaultInventoryQueryAdapter.name,
        count: balances.length,
        items: balances.map((b) => ({
          skuCode: b.sku.code,
          skuName: b.sku.name,
          uom: b.sku.uom,
          warehouseCode: b.bin.zone.warehouse.code,
          zoneCode: b.bin.zone.code,
          binCode: b.bin.code,
          binBarcode: b.bin.barcode,
          lotNumber: b.lotNumber,
          expiryDate: b.expiryDate,
          manufactureDate: b.manufactureDate,
          quantity: b.quantity,
        })),
      });
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      throw error;
    }
  }),
);

externalRouter.post(
  "/orders",
  requireApiKey("external:orders"),
  validate(externalOrderEnvelopeSchema),
  asyncHandler(async (req, res) => {
    try {
      const apiKey = (req as AuthedRequest).apiKey!;
      const format = (req.body.format as "json" | "edi" | undefined) ?? "json";
      const adapter = getOrderAdapter(format);
      const mapped = await adapter.fromEnvelope(req.body);

      if (mapped.data.clientId !== apiKey.clientId) {
        res.status(403).json({
          error: "clientCode does not match API key client",
        });
        return;
      }

      if (mapped.kind === "inbound") {
        const order = await prisma.inboundOrder.create({
          data: {
            clientId: mapped.data.clientId,
            warehouseId: mapped.data.warehouseId,
            asnNumber: mapped.data.asnNumber,
            notes: mapped.data.notes ?? null,
            status: mapped.data.status,
            expectedAt: mapped.data.expectedAt
              ? new Date(mapped.data.expectedAt)
              : null,
            lines: {
              create: mapped.data.lines.map((l) => ({
                skuId: l.skuId,
                expectedQty: new Prisma.Decimal(l.expectedQty),
                lotNumber: (l.lotNumber ?? "").trim(),
                expiryDate: toDateOnly(l.expiryDate),
                manufactureDate: toDateOnly(l.manufactureDate),
              })),
            },
          },
          include: { lines: true },
        });
        res.status(201).json({
          adapter: adapter.name,
          documentType: req.body.documentType,
          kind: "inbound",
          order,
        });
        return;
      }

      const order = await prisma.outboundOrder.create({
        data: {
          clientId: mapped.data.clientId,
          warehouseId: mapped.data.warehouseId,
          orderNumber: mapped.data.orderNumber,
          notes: mapped.data.notes ?? null,
          status: mapped.data.status,
          lines: {
            create: mapped.data.lines.map((l) => ({
              skuId: l.skuId,
              requestedQty: new Prisma.Decimal(l.requestedQty),
              lotNumber:
                l.lotNumber == null || l.lotNumber === ""
                  ? null
                  : l.lotNumber.trim(),
            })),
          },
        },
        include: { lines: true },
      });
      res.status(201).json({
        adapter: adapter.name,
        documentType: req.body.documentType,
        kind: "outbound",
        order,
      });
    } catch (error) {
      if (isAppError(error)) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }
      if (!handlePrismaError(error, res)) throw error;
    }
  }),
);

externalRouter.get(
  "/orders",
  requireApiKey("external:orders"),
  asyncHandler(async (req, res) => {
    const apiKey = (req as AuthedRequest).apiKey!;
    const kind =
      typeof req.query.kind === "string" ? req.query.kind.toLowerCase() : "all";

    const [inbound, outbound] = await Promise.all([
      kind === "outbound"
        ? Promise.resolve([])
        : prisma.inboundOrder.findMany({
            where: { clientId: apiKey.clientId },
            include: { lines: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
      kind === "inbound"
        ? Promise.resolve([])
        : prisma.outboundOrder.findMany({
            where: { clientId: apiKey.clientId },
            include: { lines: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
    ]);

    res.json({ inbound, outbound });
  }),
);
