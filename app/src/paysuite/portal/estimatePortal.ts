import { HttpError } from "wasp/server";

export const getPortalEstimate: any = async (args: any, context: any) => {
    const token = (args.token || "").trim();
  if (!token || token.length < 16) {
    throw new HttpError(400, "Invalid portal link");
  }
  const estimate = await context.entities.Estimate.findFirst({
    where: { portalToken: token },
    include: {
      customer: true,
      tenant: true,
      details: { include: { product: true } },
      taxes: { include: { tax: true } },
    },
  });
  if (!estimate) throw new HttpError(404, "Estimate not found");

  return {
    estimateFullNumber: estimate.estimateFullNumber,
    status: estimate.status,
    date: estimate.date,
    subTotal: estimate.subTotal,
    discountAmount: estimate.discountAmount,
    grandTotal: estimate.grandTotal,
    note: estimate.note,
    companyName: estimate.tenant.name,
    customer: {
      firstName: estimate.customer.firstName,
      lastName: estimate.customer.lastName,
      email: estimate.customer.email,
      companyName: estimate.customer.companyName,
    },
    lines: estimate.details.map((d: any) => ({
      name: d.product.name,
      quantity: d.quantity,
      price: d.price,
      total: d.quantity * d.price,
    })),
    taxes: estimate.taxes.map((t: any) => ({
      name: t.tax?.name || "Tax",
      rate: t.rate,
      amount: t.amount,
    })),
    portalToken: token,
  };
};
