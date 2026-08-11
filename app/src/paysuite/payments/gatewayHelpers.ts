import { HttpError } from "wasp/server";
import type { CreateGatewayPaymentIntent } from "wasp/server/operations";
import { requireTenantId, dueAmount } from "../shared/tenant";
import { createInvoiceCheckoutSession } from "./invoiceCheckout";

/**
 * Unified entry for customer invoice collection gateways.
 * Stripe → live Checkout Session URL
 * PayPal / Razorpay → structured intent for WebView / external capture
 *   (full PSP SDKs are env-specific; we return a portable payment intent)
 */
export const createGatewayPaymentIntent: CreateGatewayPaymentIntent<
  { id: string; gateway: "stripe" | "paypal" | "razorpay" },
  {
    gateway: string;
    url?: string | null;
    amount: number;
    currency: string;
    reference: string;
    instructions: string;
  }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: { customer: true, tenant: true },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const due = dueAmount(invoice);
  if (due <= 0) throw new HttpError(400, "Invoice already paid");

  const reference = `${invoice.invoiceFullNumber}-${Date.now()}`;

  if (args.gateway === "stripe") {
    const session = await createInvoiceCheckoutSession(
      { id: args.id },
      context,
    );
    return {
      gateway: "stripe",
      url: session.url,
      amount: due,
      currency: "USD",
      reference: session.sessionId,
      instructions: "Open the Stripe Checkout URL to collect payment.",
    };
  }

  if (args.gateway === "paypal") {
    // Portable intent — plug PayPal Orders API with PAYPAL_CLIENT_ID/SECRET in deploy.
    const base =
      process.env.PAYPAL_CHECKOUT_BASE || "https://www.paypal.com/checkoutnow";
    const url = `${base}?amount=${encodeURIComponent(String(due))}&currency=USD&ref=${encodeURIComponent(reference)}`;
    return {
      gateway: "paypal",
      url,
      amount: due,
      currency: "USD",
      reference,
      instructions:
        "Complete PayPal checkout, then record the payment in PaySuite (or wire Orders capture webhook).",
    };
  }

  // razorpay
  return {
    gateway: "razorpay",
    url: null,
    amount: due,
    currency: "USD",
    reference,
    instructions: `Create a Razorpay order for ${due} USD with receipt ${reference}, open Checkout in WebView, then call recordInvoicePayment on success.`,
  };
};
