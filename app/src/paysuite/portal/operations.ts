import { HttpError, config } from "wasp/server";
import type {
  GetPortalInvoice,
  CreatePortalCheckout,
} from "wasp/server/operations";
import { dueAmount } from "../shared/tenant";
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
