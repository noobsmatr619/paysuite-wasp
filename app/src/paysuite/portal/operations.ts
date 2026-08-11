import { HttpError, config } from "wasp/server";
import type {
  GetPortalInvoice,
  CreatePortalCheckout,
  RecordPortalExternalPayment,
} from "wasp/server/operations";
import { dueAmount, formatDocNumber } from "../shared/tenant";
import { stripeClient } from "../../payment/stripe/stripeClient";

/**
 * Public (no login) invoice view for customers.
 * Security: unguessable portalToken only.
 */
export const getPortalInvoice: GetPortalInvoice<{ token: string }, any> =
  async (args, context) => {
    const token = (args.token || "").trim();
    if (!token || token.length < 16) {
      throw new HttpError(400, "Invalid portal link");
    }

    const invoice = await context.entities.Invoice.findFirst({
      where: { portalToken: token },
      include: {
        customer: true,
        tenant: true,
        details: { include: { product: true } },
        taxes: { include: { tax: true } },
        transactions: {
          select: {
            id: true,
            amount: true,
            receivedOn: true,
            invoiceFullNumber: true,
            note: true,
          },
          orderBy: { receivedOn: "desc" },
        },
      },
    });
    if (!invoice) throw new HttpError(404, "Invoice not found");

    return {
      invoiceFullNumber: invoice.invoiceFullNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subTotal: invoice.subTotal,
      discountAmount: invoice.discountAmount,
      grandTotal: invoice.grandTotal,
      receivedAmount: invoice.receivedAmount,
      dueAmount: dueAmount(invoice),
      note: invoice.note,
      companyName: invoice.tenant.name,
      customer: {
        firstName: invoice.customer.firstName,
        lastName: invoice.customer.lastName,
        email: invoice.customer.email,
        companyName: invoice.customer.companyName,
      },
      lines: invoice.details.map((d) => ({
        name: d.product.name,
        quantity: d.quantity,
        price: d.price,
        total: d.quantity * d.price,
      })),
      taxes: invoice.taxes.map((t) => ({
        name: t.tax?.name || "Tax",
        rate: t.rate,
        amount: t.amount,
      })),
      payments: invoice.transactions,
      portalToken: token,
    };
  };

/**
 * Public Stripe checkout for portal invoice (optional; needs real STRIPE key).
 */
export const createPortalCheckout: CreatePortalCheckout<
  { token: string },
  { url: string | null; message?: string }
> = async (args, context) => {
  const invoice = await context.entities.Invoice.findFirst({
    where: { portalToken: args.token },
    include: { customer: true, tenant: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const due = dueAmount(invoice);
  if (due <= 0) {
    return { url: null, message: "Invoice is already paid" };
  }

  const amountCents = Math.round(due * 100);
  if (amountCents < 50) {
    throw new HttpError(400, "Amount too small for card checkout");
  }

  try {
    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      success_url: `${config.frontendUrl}/portal/invoice/${args.token}?paid=1`,
      cancel_url: `${config.frontendUrl}/portal/invoice/${args.token}?paid=0`,
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
        paysuiteTenantId: invoice.tenantId,
        paysuiteType: "invoice_due_payment",
      },
    });
    return { url: session.url };
  } catch (e: any) {
    // Placeholder Stripe key → friendly message
    return {
      url: null,
      message:
        e?.message ||
        "Online card pay is not configured. Contact the company to pay this invoice.",
    };
  }
};

/**
 * Customer/staff records an external PSP payment (PayPal/Razorpay/bank ref).
 * Idempotent on transactionId token field.
 */
export const recordPortalExternalPayment: RecordPortalExternalPayment<
  {
    token: string;
    amount: number;
    gateway: "paypal" | "razorpay" | "bank" | "other";
    externalId: string;
    note?: string | null;
  },
  any
> = async (args, context) => {
  const invoice = await context.entities.Invoice.findFirst({
    where: { portalToken: args.token },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const externalId = (args.externalId || "").trim();
  if (!externalId) throw new HttpError(400, "externalId required");
  if (!(args.amount > 0)) throw new HttpError(400, "Invalid amount");

  const existing = await context.entities.Transaction.findFirst({
    where: { token: `${args.gateway}:${externalId}` },
  });
  if (existing) {
    return { ok: true, duplicate: true, transactionId: existing.id };
  }

  const due = dueAmount(invoice);
  const amount = Math.min(args.amount, due || args.amount);

  let method = await context.entities.PaymentMethod.findFirst({
    where: {
      OR: [
        { tenantId: invoice.tenantId, type: args.gateway },
        { tenantId: null, type: args.gateway },
      ],
    },
  });
  if (!method) {
    method = await context.entities.PaymentMethod.create({
      data: {
        tenantId: invoice.tenantId,
        name: args.gateway.toUpperCase(),
        type: args.gateway,
      },
    });
  }

  const lastTx = await context.entities.Transaction.findFirst({
    where: { tenantId: invoice.tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const txNum = (lastTx?.invoiceNumber || 0) + 1;

  await context.entities.Transaction.create({
    data: {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      paymentMethodId: method.id,
      invoiceNumber: txNum,
      invoiceFullNumber: formatDocNumber("PAY", txNum),
      receivedOn: new Date(),
      amount,
      note: args.note || `${args.gateway} ${externalId}`,
      token: `${args.gateway}:${externalId}`,
    },
  });

  const receivedAmount = invoice.receivedAmount + amount;
  const status =
    receivedAmount >= invoice.grandTotal - 0.001
      ? "paid"
      : receivedAmount > 0
        ? "partially_paid"
        : "due";

  const updated = await context.entities.Invoice.update({
    where: { id: invoice.id },
    data: { receivedAmount, status },
  });

  return {
    ok: true,
    duplicate: false,
    status: updated.status,
    dueAmount: dueAmount(updated),
  };
};
