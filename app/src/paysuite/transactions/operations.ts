import { assertPermission } from "../shared/planLimits";
import { HttpError } from "wasp/server";
import type {
  GetTransactions,
  GetPaymentMethods,
  CreatePaymentMethod,
  DeletePaymentMethod,
} from "wasp/server/operations";
import type { PaymentMethod } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";

export const getTransactions: GetTransactions<
  { customerId?: string; invoiceId?: string },
  any[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Transaction.findMany({
    where: {
      tenantId,
      ...(args?.customerId ? { customerId: args.customerId } : {}),
      ...(args?.invoiceId ? { invoiceId: args.invoiceId } : {}),
    },
    include: {
      customer: true,
      invoice: true,
      paymentMethod: true,
      receivedBy: true,
    },
    orderBy: { receivedOn: "desc" },
  });
};

export const getPaymentMethods: GetPaymentMethods<void, PaymentMethod[]> =
  async (_args, context) => {
    if (!context.user) throw new HttpError(401);
    const tenantId = await requireTenantId(context.user, context.entities);
    return context.entities.PaymentMethod.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: { name: "asc" },
    });
  };

export const createPaymentMethod: CreatePaymentMethod<
  { name: string; type: string },
  PaymentMethod
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "transactions.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  if (!args.name?.trim()) throw new HttpError(400, "Name is required");
  return context.entities.PaymentMethod.create({
    data: {
      tenantId,
      name: args.name.trim(),
      type: args.type || "other",
    },
  });
};

export const deletePaymentMethod: DeletePaymentMethod<
  { id: string },
  PaymentMethod
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "transactions.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.PaymentMethod.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Payment method not found");
  return context.entities.PaymentMethod.delete({ where: { id: args.id } });
};
