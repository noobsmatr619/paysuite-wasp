import type { RecurringInvoicesJob } from "wasp/server/jobs";
import { formatDocNumber } from "../shared/tenant";
import { isOccurrenceDue, nextRecurringDate, normalizeInterval } from "./recurrence";

/**
 * Daily job: clone a new due invoice from each recurring source when its next
 * occurrence falls due, honouring the invoice's weekly/monthly/yearly interval.
 */
export const recurringInvoicesJob: RecurringInvoicesJob<
  never,
  void
> = async (_args, context) => {
  const now = new Date();
  const candidates = await context.entities.Invoice.findMany({
    where: {
      recurring: true,
      status: { in: ["paid", "due", "partially_paid"] },
    },
    include: { details: true, taxes: true },
    take: 100,
  });

  for (const source of candidates) {
    const interval = normalizeInterval(source.recurringInterval);

    // Schedule from the most recent occurrence, or the issue date if none.
    const lastOccurrence = await context.entities.Invoice.findFirst({
      where: {
        tenantId: source.tenantId,
        referenceNumber: `recurring-of-${source.id}`,
      },
      orderBy: { issueDate: "desc" },
    });

    if (!isOccurrenceDue(source.issueDate, lastOccurrence?.issueDate ?? null, interval, now)) {
      continue;
    }

    const last = await context.entities.Invoice.findFirst({
      where: { tenantId: source.tenantId },
      orderBy: { invoiceNumber: "desc" },
    });
    const invoiceNumber = (last?.invoiceNumber || 0) + 1;
    const issueDate = nextRecurringDate(lastOccurrence?.issueDate ?? source.issueDate, interval);
    // Preserve the source's issue-to-due gap rather than assuming 30 days.
    const termDays = Math.max(
      0,
      Math.round((source.dueDate.getTime() - source.issueDate.getTime()) / 86400000)
    );
    const dueDate = new Date(issueDate.getTime() + termDays * 86400000);

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
        // Generated occurrences are not themselves sources. Marking them
        // recurring made every clone spawn its own series.
        recurring: false,
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
