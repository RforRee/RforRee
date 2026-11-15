import { OutboundOrderStatus, Prisma } from "@prisma/client";
import { AppError } from "../errors.js";
import { prisma } from "../lib/prisma.js";
import { inventoryService } from "./inventory.js";

export type ShipLineInput = {
  lineId: string;
  /** Quantity to ship now; defaults to remaining requested qty. */
  quantity?: number | string;
};

export type ShipInput = {
  lines?: ShipLineInput[];
};

export async function shipOutboundOrder(orderId: string, input: ShipInput = {}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.outboundOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) {
      throw new AppError("Outbound order not found", 404, "NOT_FOUND");
    }
    if (
      order.status === OutboundOrderStatus.CANCELLED ||
      order.status === OutboundOrderStatus.SHIPPED
    ) {
      throw new AppError(
        `Cannot ship order in status ${order.status}`,
        409,
        "INVALID_STATUS",
      );
    }

    const requested: ShipLineInput[] =
      input.lines && input.lines.length > 0
        ? input.lines
        : order.lines.map((l) => ({ lineId: l.id }));

    const lineById = new Map(order.lines.map((l) => [l.id, l]));
    const shipments = [];

    for (const ship of requested) {
      const line = lineById.get(ship.lineId);
      if (!line) {
        throw new AppError(`Unknown outbound line ${ship.lineId}`, 400);
      }

      const remaining = new Prisma.Decimal(line.requestedQty).minus(
        line.shippedQty,
      );
      if (remaining.lte(0)) continue;

      const qty =
        ship.quantity != null
          ? new Prisma.Decimal(ship.quantity)
          : remaining;
      if (qty.lte(0)) {
        throw new AppError("Ship quantity must be positive", 400);
      }
      if (qty.gt(remaining)) {
        throw new AppError(
          `Ship qty ${qty.toString()} exceeds remaining ${remaining.toString()} on line ${line.id}`,
          409,
          "OVER_SHIP",
        );
      }

      const { allocations } = await inventoryService.allocateAndDeductFifo(
        {
          clientId: order.clientId,
          warehouseId: order.warehouseId,
          skuId: line.skuId,
          quantity: qty,
          lotNumber: line.lotNumber,
          referenceType: "OutboundOrder",
          referenceId: order.id,
          notes: `Outbound line ${line.id}`,
        },
        tx,
      );

      const updatedLine = await tx.outboundOrderLine.update({
        where: { id: line.id },
        data: { shippedQty: { increment: qty } },
      });
      line.shippedQty = updatedLine.shippedQty;

      shipments.push({
        lineId: line.id,
        quantity: qty,
        allocations: allocations.map((a) => ({
          binId: a.binId,
          lotNumber: a.lotNumber,
          expiryDate: a.expiryDate,
          manufactureDate: a.manufactureDate,
          quantity: a.quantity,
          transactionId: a.transaction.id,
        })),
      });
    }

    if (shipments.length === 0) {
      throw new AppError("Nothing to ship", 400, "NOTHING_TO_SHIP");
    }

    const refreshed = await tx.outboundOrder.findUniqueOrThrow({
      where: { id: order.id },
      include: { lines: true },
    });
    const allDone = refreshed.lines.every((l) =>
      new Prisma.Decimal(l.shippedQty).gte(l.requestedQty),
    );

    const updatedOrder = await tx.outboundOrder.update({
      where: { id: order.id },
      data: {
        status: allDone
          ? OutboundOrderStatus.SHIPPED
          : OutboundOrderStatus.SHIPPING,
        shippedAt: allDone ? new Date() : null,
      },
      include: { lines: true },
    });

    return { order: updatedOrder, shipments };
  });
}
