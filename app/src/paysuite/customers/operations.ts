import { HttpError } from "wasp/server";
import type {
  GetCustomers,
  GetCustomer,
  CreateCustomer,
  UpdateCustomer,
  DeleteCustomer,
} from "wasp/server/operations";
import type { Customer } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";
import { assertWithinPlanLimit, assertPermission } from "../shared/planLimits";
import type { CustomerInput } from "../shared/types";

type ListArgs = { search?: string; status?: string };

export const getCustomers: GetCustomers<ListArgs, Customer[]> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  return context.entities.Customer.findMany({
    where: {
      tenantId,
      ...(args?.status ? { status: args.status } : {}),
      ...(args?.search
        ? {
            OR: [
              { firstName: { contains: args.search, mode: "insensitive" } },
              { lastName: { contains: args.search, mode: "insensitive" } },
              { email: { contains: args.search, mode: "insensitive" } },
              { companyName: { contains: args.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getCustomer: GetCustomer<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const customer = await context.entities.Customer.findFirst({
    where: { id: args.id, tenantId },
    include: {
      invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      estimates: { orderBy: { createdAt: "desc" }, take: 20 },
      transactions: { orderBy: { receivedOn: "desc" }, take: 20 },
    },
  });
  if (!customer) throw new HttpError(404, "Customer not found");
  return customer;
};

export const createCustomer: CreateCustomer<CustomerInput, Customer> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "customers.manage");
  await assertWithinPlanLimit(context.entities as any, tenantId, "customers");

  if (!args.firstName?.trim()) {
    throw new HttpError(400, "First name is required");
  }

  return context.entities.Customer.create({
    data: {
      tenantId,
      firstName: args.firstName.trim(),
      lastName: args.lastName ?? null,
      email: args.email ?? null,
      phoneCountry: args.phoneCountry ?? null,
      phoneNumber: args.phoneNumber ?? null,
      taxNo: args.taxNo ?? null,
      companyName: args.companyName ?? null,
      address: args.address ?? null,
      status: args.status || "active",
      portalAccess: args.portalAccess ?? false,
    },
  });
};

export const updateCustomer: UpdateCustomer<
  CustomerInput & { id: string },
  Customer
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const existing = await context.entities.Customer.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Customer not found");

  return context.entities.Customer.update({
    where: { id: args.id },
    data: {
      firstName: args.firstName?.trim() || existing.firstName,
      lastName: args.lastName ?? existing.lastName,
      email: args.email ?? existing.email,
      phoneCountry: args.phoneCountry ?? existing.phoneCountry,
      phoneNumber: args.phoneNumber ?? existing.phoneNumber,
      taxNo: args.taxNo ?? existing.taxNo,
      companyName: args.companyName ?? existing.companyName,
      address: args.address ?? existing.address,
      status: args.status ?? existing.status,
      portalAccess: args.portalAccess ?? existing.portalAccess,
    },
  });
};

export const deleteCustomer: DeleteCustomer<{ id: string }, Customer> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const existing = await context.entities.Customer.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Customer not found");

  return context.entities.Customer.delete({ where: { id: args.id } });
};
