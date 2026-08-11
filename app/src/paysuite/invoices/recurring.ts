import type { RecurringInvoicesJob } from "wasp/server/jobs";
import { formatDocNumber } from "../shared/tenant";

/**
 * Daily job: for invoices marked recurring, clone a new due invoice
 * when the previous due date has passed (simple monthly recurrence).
 */
export const recurringInvoicesJob: RecurringInvoicesJob<
  never,
  void
> = async (_args, context) => {
  const now = new Date();
  const candidates = await context.entities.Invoice.findMany({
    where: {
      recurring: true,
      dueDate: { lte: now },
      status: { in: ["paid", "due", "partially_paid"] },
    },
    include: { details: true, taxes: true },
    take: 100,
  });

  for (const source of candidates) {
    // Avoid cloning more than once per calendar month per source number
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const already = await context.entities.Invoice.findFirst({
      where: {
        tenantId: source.tenantId,
        referenceNumber: `recurring-of-${source.id}`,
        createdAt: { gte: monthStart },
      },
    });
    if (already) continue;

    const last = await context.entities.Invoice.findFirst({
      where: { tenantId: source.tenantId },
      orderBy: { invoiceNumber: "desc" },
    });
    const invoiceNumber = (last?.invoiceNumber || 0) + 1;
    const issueDate = new Date();
    const dueDate = new Date(Date.now() + 30 * 86400000);

    await context.entities.Invoice.create({
      data: {
        tenantId: source.tenantId,
        customerId: source.customerId,
        createdById: source.createdById,
        issueDate,
        dueDate,
        invoiceNumber,
        invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
        referenceNumber: `recurring-of-${source.id}`,
        recurring: true,
        status: "due",
        subTotal: source.subTotal,
        discountType: source.discountType,
        discountAmount: source.discountAmount,
        totalAmount: source.totalAmount,
        grandTotal: source.grandTotal,
        receivedAmount: 0,
        note: source.note,
        invoiceTemplate: source.invoiceTemplate,
        details: {
          create: source.details.map((d) => ({
            productId: d.productId,
            quantity: d.quantity,
            price: d.price,
          })),
        },
        taxes: {
          create: source.taxes.map((t) => ({
            taxId: t.taxId,
            rate: t.rate,
            amount: t.amount,
          })),
        },
      },
    });
  }
};
