import { HttpError } from "wasp/server";
import { normalizeInterval } from "./recurrence";
import type {
  GetInvoices,
  GetInvoice,
  CreateInvoice,
  UpdateInvoice,
  DeleteInvoice,
  CloneInvoice,
  RecordInvoicePayment,
} from "wasp/server/operations";
import type { Invoice } from "wasp/entities";
import crypto from "crypto";
import {
  requireTenantId,
  computeLineTotals,
  formatDocNumber,
  dueAmount,
} from "../shared/tenant";
import { assertWithinPlanLimit, assertPermission } from "../shared/planLimits";
import type { InvoiceInput } from "../shared/types";

function newPortalToken() {
  return crypto.randomBytes(24).toString("hex");
}

const invoiceInclude = {
  customer: true,
  details: { include: { product: true } },
  taxes: { include: { tax: true } },
  transactions: true,
  createdBy: true,
} as const;

export const getInvoices: GetInvoices<
  { search?: string; status?: string; customerId?: string },
  any[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoices = await context.entities.Invoice.findMany({
    where: {
      tenantId,
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.customerId ? { customerId: args.customerId } : {}),
      ...(args?.search
        ? {
            OR: [
              {
                invoiceFullNumber: {
                  contains: args.search,
                  mode: "insensitive",
                },
              },
              {
                customer: {
                  firstName: { contains: args.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return invoices.map((inv) => ({
    ...inv,
    dueAmount: dueAmount(inv),
  }));
};

export const getInvoice: GetInvoice<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: invoiceInclude,
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  return { ...invoice, dueAmount: dueAmount(invoice) };
};

export const createInvoice: CreateInvoice<InvoiceInput, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "invoices.manage");
  await assertWithinPlanLimit(context.entities as any, tenantId, "invoices");

  if (!args.customerId) throw new HttpError(400, "Customer is required");
  if (!args.lines?.length) throw new HttpError(400, "At least one line item");

  const customer = await context.entities.Customer.findFirst({
    where: { id: args.customerId, tenantId },
  });
  if (!customer) throw new HttpError(400, "Invalid customer");

  const taxRateTotal = (args.taxes || []).reduce((s, t) => s + t.rate, 0);
  const totals = computeLineTotals(
    args.lines,
    args.discountType || "none",
    args.discountAmount,
    taxRateTotal,
  );

  const last = await context.entities.Invoice.findFirst({
    where: { tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const invoiceNumber = (last?.invoiceNumber || 0) + 1;
  const invoiceFullNumber = formatDocNumber("INV", invoiceNumber);

  const invoice = await context.entities.Invoice.create({
    data: {
      tenantId,
      customerId: args.customerId,
      createdById: context.user.id,
      issueDate: new Date(args.issueDate),
      dueDate: new Date(args.dueDate),
      invoiceNumber,
      invoiceFullNumber,
      referenceNumber: args.referenceNumber ?? null,
      recurring: args.recurring ?? false,
      recurringInterval: args.recurring ? normalizeInterval(args.recurringInterval) : null,
      status: "due",
      subTotal: totals.subTotal,
      discountType: args.discountType || "none",
      discountAmount: totals.discountAmount,
      totalAmount: totals.totalAmount,
      grandTotal: totals.grandTotal,
      receivedAmount: 0,
      note: args.note ?? null,
      invoiceTemplate: args.invoiceTemplate ?? 1,
      portalToken: newPortalToken(),
      details: {
        create: args.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          price: l.price,
        })),
      },
      taxes: {
        create: (args.taxes || []).map((t) => ({
          taxId: t.taxId,
          rate: t.rate,
          amount: (totals.totalAmount * t.rate) / 100,
        })),
      },
    },
    include: invoiceInclude,
  });

  return { ...invoice, dueAmount: dueAmount(invoice) };
};

/** Ensure invoice has a portal token; returns public path. */
export async function ensureInvoicePortalLink(
  args: { id: string },
  context: any,
): Promise<{ token: string; path: string }> {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const inv = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!inv) throw new HttpError(404, "Invoice not found");
  let token = inv.portalToken;
  if (!token) {
    token = newPortalToken();
    await context.entities.Invoice.update({
      where: { id: inv.id },
      data: { portalToken: token },
    });
  }
  return {
    token: token!,
    path: `/portal/invoice/${token}`,
  };
}

export const updateInvoice: UpdateInvoice<
  InvoiceInput & { id: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const existing = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: { details: true, taxes: true },
  });
  if (!existing) throw new HttpError(404, "Invoice not found");

  if (args.lines?.length) {
    await context.entities.InvoiceDetail.deleteMany({
      where: { invoiceId: existing.id },
    });
    await context.entities.InvoiceTax.deleteMany({
      where: { invoiceId: existing.id },
    });

    const taxRateTotal = (args.taxes || []).reduce((s, t) => s + t.rate, 0);
    const totals = computeLineTotals(
      args.lines,
      args.discountType || existing.discountType,
      args.discountAmount ?? existing.discountAmount,
      taxRateTotal,
    );

    const status =
      existing.receivedAmount <= 0
        ? "due"
        : existing.receivedAmount >= totals.grandTotal
          ? "paid"
          : "partially_paid";

    const invoice = await context.entities.Invoice.update({
      where: { id: existing.id },
      data: {
        customerId: args.customerId || existing.customerId,
        issueDate: args.issueDate
          ? new Date(args.issueDate)
          : existing.issueDate,
        dueDate: args.dueDate ? new Date(args.dueDate) : existing.dueDate,
        referenceNumber: args.referenceNumber ?? existing.referenceNumber,
        discountType: args.discountType || existing.discountType,
        discountAmount: totals.discountAmount,
        subTotal: totals.subTotal,
        totalAmount: totals.totalAmount,
        grandTotal: totals.grandTotal,
        note: args.note ?? existing.note,
        invoiceTemplate: args.invoiceTemplate ?? existing.invoiceTemplate,
        status,
        details: {
          create: args.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            price: l.price,
          })),
        },
        taxes: {
          create: (args.taxes || []).map((t) => ({
            taxId: t.taxId,
            rate: t.rate,
            amount: (totals.totalAmount * t.rate) / 100,
          })),
        },
      },
      include: invoiceInclude,
    });
    return { ...invoice, dueAmount: dueAmount(invoice) };
  }

  const invoice = await context.entities.Invoice.update({
    where: { id: existing.id },
    data: {
      note: args.note ?? existing.note,
      referenceNumber: args.referenceNumber ?? existing.referenceNumber,
      recurring:
        (args as any).recurring !== undefined
          ? !!(args as any).recurring
          : existing.recurring,
      recurringInterval:
        (args as any).recurringInterval !== undefined
          ? normalizeInterval((args as any).recurringInterval)
          : existing.recurringInterval,
      invoiceTemplate:
        (args as any).invoiceTemplate ?? existing.invoiceTemplate,
    },
    include: invoiceInclude,
  });
  return { ...invoice, dueAmount: dueAmount(invoice) };
};

export const deleteInvoice: DeleteInvoice<{ id: string }, Invoice> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Invoice not found");
  return context.entities.Invoice.delete({ where: { id: args.id } });
};

export const cloneInvoice: CloneInvoice<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const source = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
    include: { details: true, taxes: true },
  });
  if (!source) throw new HttpError(404, "Invoice not found");

  const last = await context.entities.Invoice.findFirst({
    where: { tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const invoiceNumber = (last?.invoiceNumber || 0) + 1;

  const invoice = await context.entities.Invoice.create({
    data: {
      tenantId,
      customerId: source.customerId,
      createdById: context.user.id,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      invoiceNumber,
      invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
      referenceNumber: source.referenceNumber,
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
      portalToken: newPortalToken(),
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
    include: invoiceInclude,
  });
  return { ...invoice, dueAmount: dueAmount(invoice) };
};

export const recordInvoicePayment: RecordInvoicePayment<
  {
    id: string;
    amount: number;
    paymentMethodId?: string | null;
    note?: string | null;
    receivedOn?: string;
  },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const invoice = await context.entities.Invoice.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!invoice) throw new HttpError(404, "Invoice not found");
  if (args.amount <= 0) throw new HttpError(400, "Amount must be positive");

  const due = dueAmount(invoice);
  if (args.amount > due + 0.001) {
    throw new HttpError(400, `Amount exceeds due balance (${due})`);
  }

  const lastTx = await context.entities.Transaction.findFirst({
    where: { tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const txNum = (lastTx?.invoiceNumber || 0) + 1;

  await context.entities.Transaction.create({
    data: {
      tenantId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      paymentMethodId: args.paymentMethodId ?? null,
      receivedById: context.user.id,
      invoiceNumber: txNum,
      invoiceFullNumber: formatDocNumber("PAY", txNum),
      receivedOn: args.receivedOn ? new Date(args.receivedOn) : new Date(),
      amount: args.amount,
      note: args.note ?? null,
    },
  });

  const receivedAmount = invoice.receivedAmount + args.amount;
  const status =
    receivedAmount >= invoice.grandTotal
      ? "paid"
      : receivedAmount > 0
        ? "partially_paid"
        : "due";

  const updated = await context.entities.Invoice.update({
    where: { id: invoice.id },
    data: { receivedAmount, status },
    include: invoiceInclude,
  });

  return { ...updated, dueAmount: dueAmount(updated) };
};
