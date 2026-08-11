import { HttpError, config } from "wasp/server";
import type {
  CreateInvoiceCheckoutSession,
  GetInvoicePaymentLink,
} from "wasp/server/operations";
import { stripeClient } from "../../payment/stripe/stripeClient";
import { requireTenantId, dueAmount, formatDocNumber } from "../shared/tenant";

/**
 * Creates a Stripe Checkout session for the remaining invoice balance.
 * Metadata drives fulfillment in the Stripe webhook.
 */
export const createInvoiceCheckoutSession: CreateInvoiceCheckoutSession<
  { id: string },
  { sessionId: string; url: string | null }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: { customer: true, tenant: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const due = dueAmount(invoice);
  if (due <= 0) throw new HttpError(400, "Invoice is already paid");

  const amountCents = Math.round(due * 100);
  if (amountCents < 50) {
    throw new HttpError(400, "Amount too small for Stripe (min $0.50)");
  }

  const session = await stripeClient.checkout.sessions.create({
    mode: "payment",
    success_url: `${config.frontendUrl}/invoices/${invoice.id}?paid=1`,
    cancel_url: `${config.frontendUrl}/invoices/${invoice.id}?paid=0`,
    customer_email: invoice.customer.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${invoice.invoiceFullNumber}`,
            description: `Payment to ${invoice.tenant.name}`,
          },
        },
      },
    ],
    metadata: {
      paysuiteInvoiceId: invoice.id,
      paysuiteTenantId: tenantId,
      paysuiteType: "invoice_due_payment",
    },
  });

  return { sessionId: session.id, url: session.url };
};

/**
 * Public-ish helper for staff to copy a checkout URL (auth required).
 */
export const getInvoicePaymentLink: GetInvoicePaymentLink<
  { id: string },
  { url: string | null }
> = async (args, context) => {
  const result = await createInvoiceCheckoutSession(args, context);
  return { url: result.url };
};

/**
 * Apply a successful Stripe payment onto a PaySuite invoice.
 * Called from the Stripe webhook when metadata matches.
 */
export async function applyStripeInvoicePayment(
  entities: {
    Invoice: any;
    Transaction: any;
    PaymentMethod: any;
  },
  opts: {
    invoiceId: string;
    amountCents: number;
    stripeSessionId: string;
  },
) {
  const invoice = await entities.Invoice.findUnique({
    where: { id: opts.invoiceId },
  });
  if (!invoice) return { ok: false as const, reason: "invoice_not_found" };

  // Idempotency: skip if this session already recorded
  const existing = await entities.Transaction.findFirst({
    where: { token: opts.stripeSessionId },
  });
  if (existing) return { ok: true as const, duplicate: true };

  let method = await entities.PaymentMethod.findFirst({
    where: {
      OR: [
        { tenantId: invoice.tenantId, type: "stripe" },
        { tenantId: null, type: "stripe" },
      ],
    },
  });
  if (!method) {
    method = await entities.PaymentMethod.create({
      data: {
        tenantId: invoice.tenantId,
        name: "Stripe",
        type: "stripe",
      },
    });
  }

  const amount = opts.amountCents / 100;
  const lastTx = await entities.Transaction.findFirst({
    where: { tenantId: invoice.tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const txNum = (lastTx?.invoiceNumber || 0) + 1;

  await entities.Transaction.create({
    data: {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      paymentMethodId: method.id,
      invoiceNumber: txNum,
      invoiceFullNumber: formatDocNumber("PAY", txNum),
      receivedOn: new Date(),
      amount,
      note: "Stripe Checkout",
      token: opts.stripeSessionId,
    },
  });

  const receivedAmount = invoice.receivedAmount + amount;
  const status =
    receivedAmount >= invoice.grandTotal - 0.001
      ? "paid"
      : receivedAmount > 0
        ? "partially_paid"
        : "due";

  await entities.Invoice.update({
    where: { id: invoice.id },
    data: { receivedAmount, status },
  });

  return { ok: true as const, duplicate: false };
}
