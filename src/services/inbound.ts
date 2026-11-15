import { InboundOrderStatus, Prisma } from "@prisma/client";
import { AppError } from "../errors.js";
import { toDateOnly } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { inventoryService } from "./inventory.js";

export type ReceiveLineInput = {
  lineId: string;
  binId: string;
  quantity: number | string;
  lotNumber?: string | null;
  expiryDate?: string | Date | null;
  manufactureDate?: string | Date | null;
};

export type ReceiveInput = {
  asnNumber: string;
  lines: ReceiveLineInput[];
};

export async function receiveInboundOrder(orderId: string, input: ReceiveInput) {
  if (!input.lines.length) {
    throw new AppError("At least one receive line is required", 400);
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.inboundOrder.findUnique({
      where: { id: orderId },
      include: { lines: true, warehouse: true },
    });
    if (!order) {
      throw new AppError("Inbound order not found", 404, "NOT_FOUND");
    }
    if (
      order.status === InboundOrderStatus.CANCELLED ||
      order.status === InboundOrderStatus.COMPLETED
    ) {
      throw new AppError(
        `Cannot receive against order in status ${order.status}`,
        409,
        "INVALID_STATUS",
      );
    }
    if (order.asnNumber !== input.asnNumber.trim()) {
      throw new AppError(
        "ASN number does not match this inbound order",
        400,
        "ASN_MISMATCH",
      );
    }

    const lineById = new Map(order.lines.map((l) => [l.id, l]));
    const results = [];

    for (const recv of input.lines) {
      const line = lineById.get(recv.lineId);
      if (!line) {
        throw new AppError(`Unknown inbound line ${recv.lineId}`, 400);
      }

      const qty = new Prisma.Decimal(recv.quantity);
      if (qty.lte(0)) {
        throw new AppError("Receive quantity must be positive", 400);
      }

      const remaining = new Prisma.Decimal(line.expectedQty).minus(line.receivedQty);
      if (qty.gt(remaining)) {
        throw new AppError(
          `Receive qty ${qty.toString()} exceeds remaining ${remaining.toString()} on line ${line.id}`,
          409,
          "OVER_RECEIVE",
        );
      }

      // Bin must belong to the order's warehouse.
      const bin = await tx.bin.findUnique({
        where: { id: recv.binId },
        include: { zone: true },
      });
      if (!bin || bin.zone.warehouseId !== order.warehouseId) {
        throw new AppError(
          `Bin ${recv.binId} is not in warehouse ${order.warehouseId}`,
          400,
          "INVALID_BIN",
        );
      }

      const lotNumber =
        recv.lotNumber != null ? recv.lotNumber : line.lotNumber;
      const expiryDate =
        recv.expiryDate !== undefined ? recv.expiryDate : line.expiryDate;
      const manufactureDate =
        recv.manufactureDate !== undefined
          ? recv.manufactureDate
          : line.manufactureDate;

      const { transaction, balance } = await inventoryService.applyInbound(
        {
          clientId: order.clientId,
          skuId: line.skuId,
          binId: recv.binId,
          lotNumber,
          expiryDate: toDateOnly(expiryDate),
          manufactureDate: toDateOnly(manufactureDate),
          quantity: qty,
          referenceType: "InboundOrder",
          referenceId: order.id,
          notes: `Inbound line ${line.id}`,
        },
        tx,
      );

      const updatedLine = await tx.inboundOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: { increment: qty } },
      });
      // Keep local map in sync for multi-receive of same line in one request.
      line.receivedQty = updatedLine.receivedQty;

      results.push({
        lineId: line.id,
        transaction,
        balance,
        receivedQty: updatedLine.receivedQty,
      });
    }

    const refreshed = await tx.inboundOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const allDone = refreshed.lines.every((l) =>
      new Prisma.Decimal(l.receivedQty).gte(l.expectedQty),
    );

    const updatedOrder = await tx.inboundOrder.update({
      where: { id: order.id },
      data: {
        status: allDone
          ? InboundOrderStatus.COMPLETED
          : InboundOrderStatus.RECEIVING,
        completedAt: allDone ? new Date() : null,
      },
      include: { lines: true },
    });

    return { order: updatedOrder, receipts: results };
  });
}
