import { HttpError, config } from "wasp/server";
import type { PayNowBilling, GetPlanOrders } from "wasp/server/operations";
import { stripeClient } from "../../payment/stripe/stripeClient";
import { requireTenantId } from "../shared/tenant";

/**
 * Laravel PlanBuyController::payNow — settle an outstanding subscription
 * billing. It records a PlanOrder in "open" state against the gateway's
 * transaction id; the webhook flips it to "paid".
 *
 * Stripe returns a live Checkout URL. PayPal returns a portable intent, the
 * same shape createGatewayPaymentIntent uses, because the Orders API needs
 * PAYPAL_CLIENT_ID/SECRET that are not in this repo.
 */
export const payNowBilling: PayNowBilling<
  { billingId: string; paymentMethod: "stripe" | "paypal" },
  {
    gateway: string;
    url: string | null;
    amount: number;
    reference: string;
    orderId: string;
    instructions: string;
  }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities, {
    allowExpired: true,
  });

  const billing = await context.entities.BillingHistory.findFirst({
    where: { id: args.billingId, tenantId },
    include: { plan: true },
  });
  if (!billing) throw new HttpError(404, "Billing not found");
  if (billing.plan.isFree) {
    throw new HttpError(400, "This is a free plan, you don't need to pay anything");
  }
  if (billing.status === "paid") {
    throw new HttpError(400, "Already billing has been paid");
  }

  const amountCents = Math.round(billing.amount * 100);

  if (args.paymentMethod === "stripe") {
    if (amountCents < 50) {
      throw new HttpError(400, "Amount too small for Stripe (min $0.50)");
    }
    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      success_url: `${config.frontendUrl}/plans?billing=${billing.id}&paid=1`,
      cancel_url: `${config.frontendUrl}/plans?billing=${billing.id}&paid=0`,
      customer_email: context.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: billing.plan.name },
          },
        },
      ],
      metadata: {
        paysuiteBillingId: billing.id,
        paysuiteTenantId: tenantId,
        paysuiteType: "plan_pay_now",
      },
    });

    const order = await context.entities.PlanOrder.create({
      data: {
        transactionId: session.id,
        planId: billing.planId,
        tenantId,
        userId: context.user.id,
        status: "open",
      },
    });

    return {
      gateway: "stripe",
      url: session.url,
      amount: billing.amount,
      reference: session.id,
      orderId: order.id,
      instructions: "Open the Stripe Checkout URL to settle this billing.",
    };
  }

  const reference = `${billing.invoiceNumber}-${Date.now()}`;
  const order = await context.entities.PlanOrder.create({
    data: {
      transactionId: reference,
      planId: billing.planId,
      tenantId,
      userId: context.user.id,
      status: "open",
    },
  });
  const base =
    process.env.PAYPAL_CHECKOUT_BASE || "https://www.paypal.com/checkoutnow";

  return {
    gateway: "paypal",
    url: `${base}?amount=${encodeURIComponent(String(billing.amount))}&currency=USD&ref=${encodeURIComponent(reference)}`,
    amount: billing.amount,
    reference,
    orderId: order.id,
    instructions:
      "Complete PayPal checkout, then the Orders capture webhook marks the order paid.",
  };
};

export const getPlanOrders: GetPlanOrders<void, any[]> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities, {
    allowExpired: true,
  });
  return context.entities.PlanOrder.findMany({
    where: { tenantId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
};
