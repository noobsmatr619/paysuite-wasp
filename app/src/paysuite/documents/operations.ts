import { HttpError } from "wasp/server";
import type {
  GetInvoiceDocument,
  GetEstimateDocument,
  SendInvoiceEmail,
  SendEstimateEmail,
} from "wasp/server/operations";
import { emailSender } from "wasp/server/email";
import { requireTenantId } from "../shared/tenant";
import { buildDocumentHtml, customerDisplay } from "./pdfHtml";

export const getInvoiceDocument: GetInvoiceDocument<
  { id: string },
  { html: string; fullNumber: string; filename: string }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: {
      customer: true,
      details: { include: { product: true } },
      taxes: { include: { tax: true } },
      tenant: true,
    },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const html = buildDocumentHtml({
    fullNumber: invoice.invoiceFullNumber,
    dateLabel: `Issued ${invoice.issueDate.toLocaleDateString()} · Due ${invoice.dueDate.toLocaleDateString()}`,
    status: invoice.status,
    subTotal: invoice.subTotal,
    discountAmount: invoice.discountAmount,
    grandTotal: invoice.grandTotal,
    note: invoice.note,
    companyName: invoice.tenant.name,
    customerName: customerDisplay(invoice.customer),
    customerEmail: invoice.customer.email,
    customerAddress: invoice.customer.address,
    lines: invoice.details.map((d) => ({
      name: d.product.name,
      quantity: d.quantity,
      price: d.price,
    })),
    taxes: invoice.taxes.map((t) => ({
      name: t.tax.name,
      rate: t.rate,
      amount: t.amount,
    })),
    extraRows: [
      { label: "Paid", value: String(invoice.receivedAmount) },
      {
        label: "Due",
        value: String(
          Math.max(0, invoice.grandTotal - invoice.receivedAmount),
        ),
      },
    ],
  });

  return {
    html,
    fullNumber: invoice.invoiceFullNumber,
    filename: `${invoice.invoiceFullNumber}.pdf`,
  };
};

export const getEstimateDocument: GetEstimateDocument<
  { id: string },
  { html: string; fullNumber: string; filename: string }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const estimate = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
    include: {
      customer: true,
      details: { include: { product: true } },
      taxes: { include: { tax: true } },
      tenant: true,
    },
  });
  if (!estimate) throw new HttpError(404, "Estimate not found");

  const html = buildDocumentHtml({
    fullNumber: estimate.estimateFullNumber,
    dateLabel: `Date ${estimate.date.toLocaleDateString()}`,
    status: estimate.status,
    subTotal: estimate.subTotal,
    discountAmount: estimate.discountAmount,
    grandTotal: estimate.grandTotal,
    note: estimate.note,
    companyName: estimate.tenant.name,
    customerName: customerDisplay(estimate.customer),
    customerEmail: estimate.customer.email,
    customerAddress: estimate.customer.address,
    lines: estimate.details.map((d) => ({
      name: d.product.name,
      quantity: d.quantity,
      price: d.price,
    })),
    taxes: estimate.taxes.map((t) => ({
      name: t.tax.name,
      rate: t.rate,
      amount: t.amount,
    })),
  });

  return {
    html,
    fullNumber: estimate.estimateFullNumber,
    filename: `${estimate.estimateFullNumber}.pdf`,
  };
};

export const sendInvoiceEmail: SendInvoiceEmail<
  { id: string; toEmail?: string | null },
  { ok: true; to: string }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: {
      customer: true,
      details: { include: { product: true } },
      taxes: { include: { tax: true } },
      tenant: true,
    },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");

  const to = args.toEmail || invoice.customer.email;
  if (!to) throw new HttpError(400, "Customer has no email address");

  const { html, fullNumber } = await getInvoiceDocument({ id: args.id }, context);

  await emailSender.send({
    to,
    subject: `Invoice ${fullNumber} from ${invoice.tenant.name}`,
    text: `Please find invoice ${fullNumber}. Grand total: ${invoice.grandTotal}. Status: ${invoice.status}.`,
    html: `<p>Hello ${customerDisplay(invoice.customer)},</p>
      <p>Please find your invoice <strong>${fullNumber}</strong>.</p>
      <p>Grand total: <strong>${invoice.grandTotal}</strong> · Status: ${invoice.status}</p>
      <hr/>${html}`,
  });

  return { ok: true, to };
};

export const sendEstimateEmail: SendEstimateEmail<
  { id: string; toEmail?: string | null },
  { ok: true; to: string }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const estimate = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
    include: {
      customer: true,
      details: { include: { product: true } },
      taxes: { include: { tax: true } },
      tenant: true,
    },
  });
  if (!estimate) throw new HttpError(404, "Estimate not found");

  const to = args.toEmail || estimate.customer.email;
  if (!to) throw new HttpError(400, "Customer has no email address");

  const { html, fullNumber } = await getEstimateDocument(
    { id: args.id },
    context,
  );

  await emailSender.send({
    to,
    subject: `Estimate ${fullNumber} from ${estimate.tenant.name}`,
    text: `Please find estimate ${fullNumber}. Grand total: ${estimate.grandTotal}.`,
    html: `<p>Hello ${customerDisplay(estimate.customer)},</p>
      <p>Please find your estimate <strong>${fullNumber}</strong>.</p>
      <p>Grand total: <strong>${estimate.grandTotal}</strong></p>
      <hr/>${html}`,
  });

  return { ok: true, to };
};
