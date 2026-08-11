import { HttpError } from "wasp/server";
import type {
  GetEstimates,
  GetEstimate,
  CreateEstimate,
  UpdateEstimate,
  DeleteEstimate,
  ChangeEstimateStatus,
  ConvertEstimateToInvoice,
} from "wasp/server/operations";
import type { Estimate } from "wasp/entities";
import {
  requireTenantId,
  computeLineTotals,
  formatDocNumber,
  dueAmount,
} from "../shared/tenant";
import { assertWithinPlanLimit, assertPermission } from "../shared/planLimits";
import type { EstimateInput } from "../shared/types";

const estimateInclude = {
  customer: true,
  details: { include: { product: true } },
  taxes: { include: { tax: true } },
  createdBy: true,
} as const;

export const getEstimates: GetEstimates<
  { search?: string; status?: string; customerId?: string },
  any[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Estimate.findMany({
    where: {
      tenantId,
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.customerId ? { customerId: args.customerId } : {}),
      ...(args?.search
        ? {
            estimateFullNumber: {
              contains: args.search,
              mode: "insensitive",
            },
          }
        : {}),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });
};

export const getEstimate: GetEstimate<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const estimate = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
    include: estimateInclude,
  });
  if (!estimate) throw new HttpError(404, "Estimate not found");
  return estimate;
};

export const createEstimate: CreateEstimate<EstimateInput, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "estimates.manage");
  await assertWithinPlanLimit(context.entities as any, tenantId, "estimates");
  if (!args.customerId) throw new HttpError(400, "Customer is required");
  if (!args.lines?.length) throw new HttpError(400, "At least one line item");

  const taxRateTotal = (args.taxes || []).reduce((s, t) => s + t.rate, 0);
  const totals = computeLineTotals(
    args.lines,
    args.discountType || "none",
    args.discountAmount,
    taxRateTotal,
  );

  const last = await context.entities.Estimate.findFirst({
    where: { tenantId },
    orderBy: { estimateNumber: "desc" },
  });
  const estimateNumber = (last?.estimateNumber || 0) + 1;

  return context.entities.Estimate.create({
    data: {
      tenantId,
      customerId: args.customerId,
      createdById: context.user.id,
      date: new Date(args.date),
      estimateNumber,
      estimateFullNumber: formatDocNumber("EST", estimateNumber),
      status: "pending",
      subTotal: totals.subTotal,
      discountType: args.discountType || "none",
      discountAmount: totals.discountAmount,
      totalAmount: totals.totalAmount,
      grandTotal: totals.grandTotal,
      note: args.note ?? null,
      estimateTemplate: args.estimateTemplate ?? 1,
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
    include: estimateInclude,
  });
};

export const updateEstimate: UpdateEstimate<
  EstimateInput & { id: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Estimate not found");

  if (args.lines?.length) {
    await context.entities.EstimateDetail.deleteMany({
      where: { estimateId: existing.id },
    });
    await context.entities.EstimateTax.deleteMany({
      where: { estimateId: existing.id },
    });
    const taxRateTotal = (args.taxes || []).reduce((s, t) => s + t.rate, 0);
    const totals = computeLineTotals(
      args.lines,
      args.discountType || existing.discountType,
      args.discountAmount ?? existing.discountAmount,
      taxRateTotal,
    );
    return context.entities.Estimate.update({
      where: { id: existing.id },
      data: {
        customerId: args.customerId || existing.customerId,
        date: args.date ? new Date(args.date) : existing.date,
        discountType: args.discountType || existing.discountType,
        discountAmount: totals.discountAmount,
        subTotal: totals.subTotal,
        totalAmount: totals.totalAmount,
        grandTotal: totals.grandTotal,
        note: args.note ?? existing.note,
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
      include: estimateInclude,
    });
  }

  return context.entities.Estimate.update({
    where: { id: existing.id },
    data: { note: args.note ?? existing.note },
    include: estimateInclude,
  });
};

export const deleteEstimate: DeleteEstimate<{ id: string }, Estimate> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Estimate not found");
  return context.entities.Estimate.delete({ where: { id: args.id } });
};

export const changeEstimateStatus: ChangeEstimateStatus<
  { id: string; status: string },
  Estimate
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Estimate not found");
  if (!["pending", "approved", "rejected"].includes(args.status)) {
    throw new HttpError(400, "Invalid status");
  }
  return context.entities.Estimate.update({
    where: { id: args.id },
    data: { status: args.status },
  });
};

export const convertEstimateToInvoice: ConvertEstimateToInvoice<
  { id: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const estimate = await context.entities.Estimate.findFirst({
    where: { id: args.id, tenantId },
    include: { details: true, taxes: true },
  });
  if (!estimate) throw new HttpError(404, "Estimate not found");

  const last = await context.entities.Invoice.findFirst({
    where: { tenantId },
    orderBy: { invoiceNumber: "desc" },
  });
  const invoiceNumber = (last?.invoiceNumber || 0) + 1;

  const invoice = await context.entities.Invoice.create({
    data: {
      tenantId,
      customerId: estimate.customerId,
      createdById: context.user.id,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      invoiceNumber,
      invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
      status: "due",
      subTotal: estimate.subTotal,
      discountType: estimate.discountType,
      discountAmount: estimate.discountAmount,
      totalAmount: estimate.totalAmount,
      grandTotal: estimate.grandTotal,
      receivedAmount: 0,
      note: estimate.note,
      invoiceTemplate: estimate.estimateTemplate,
      details: {
        create: estimate.details.map((d) => ({
          productId: d.productId,
          quantity: d.quantity,
          price: d.price,
        })),
      },
      taxes: {
        create: estimate.taxes.map((t) => ({
          taxId: t.taxId,
          rate: t.rate,
          amount: t.amount,
        })),
      },
    },
    include: {
      customer: true,
      details: { include: { product: true } },
      taxes: true,
    },
  });

  await context.entities.Estimate.update({
    where: { id: estimate.id },
    data: { status: "approved" },
  });

  return { ...invoice, dueAmount: dueAmount(invoice) };
};
