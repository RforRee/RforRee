import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors.js";

function payloadMentionsOrder(payload: unknown, orderId: string): boolean {
  try {
    return JSON.stringify(payload).includes(orderId);
  } catch {
    return false;
  }
}

export async function getInboundOrderDetail(id: string) {
  const order = await prisma.inboundOrder.findUnique({
    where: { id },
    include: {
      warehouse: true,
      client: { select: { id: true, code: true, name: true } },
      lines: {
        include: { sku: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) throw new AppError("Inbound order not found", 404, "NOT_FOUND");

  const [transactions, receipts] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { referenceType: "InboundOrder", referenceId: id },
      include: {
        sku: { select: { code: true, name: true } },
        bin: { select: { code: true, barcode: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.syncMutationReceipt.findMany({
      where: { clientId: order.clientId, mutationType: "RECEIVE" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const handheldActivity = receipts.filter((r) =>
    payloadMentionsOrder(r.payload, id),
  );

  const expected = order.lines.reduce((s, l) => s + Number(l.expectedQty), 0);
  const received = order.lines.reduce((s, l) => s + Number(l.receivedQty), 0);

  return {
    order,
    progress: {
      expectedQty: expected,
      receivedQty: received,
      percent:
        expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0,
      lineCount: order.lines.length,
      completedLines: order.lines.filter(
        (l) => Number(l.receivedQty) >= Number(l.expectedQty),
      ).length,
    },
    transactions,
    handheldActivity,
  };
}

export async function getOutboundOrderDetail(id: string) {
  const order = await prisma.outboundOrder.findUnique({
    where: { id },
    include: {
      warehouse: true,
      client: { select: { id: true, code: true, name: true } },
      lines: {
        include: { sku: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!order) throw new AppError("Outbound order not found", 404, "NOT_FOUND");

  const [transactions, receipts] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { referenceType: "OutboundOrder", referenceId: id },
      include: {
        sku: { select: { code: true, name: true } },
        bin: { select: { code: true, barcode: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.syncMutationReceipt.findMany({
      where: { clientId: order.clientId, mutationType: "SHIP" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const handheldActivity = receipts.filter((r) =>
    payloadMentionsOrder(r.payload, id),
  );

  const requested = order.lines.reduce(
    (s, l) => s + Number(l.requestedQty),
    0,
  );
  const shipped = order.lines.reduce((s, l) => s + Number(l.shippedQty), 0);

  return {
    order,
    progress: {
      requestedQty: requested,
      shippedQty: shipped,
      percent:
        requested > 0
          ? Math.min(100, Math.round((shipped / requested) * 100))
          : 0,
      lineCount: order.lines.length,
      completedLines: order.lines.filter(
        (l) => Number(l.shippedQty) >= Number(l.requestedQty),
      ).length,
    },
    transactions,
    handheldActivity,
  };
}
