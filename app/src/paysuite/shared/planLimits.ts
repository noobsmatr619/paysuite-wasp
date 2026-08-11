import { HttpError } from "wasp/server";
import type { PrismaClient } from "@prisma/client";
import type { Permission } from "./permissions";
export type { Permission } from "./permissions";
export { PERMISSIONS } from "./permissions";

export type LimitResource =
  | "customers"
  | "products"
  | "invoices"
  | "estimates";

/**
 * Enforce SaaS plan caps for the tenant. Throws HttpError(403) when exceeded.
 */
export async function assertWithinPlanLimit(
  entities: {
    Subscriber: PrismaClient["subscriber"];
    Customer: PrismaClient["customer"];
    Product: PrismaClient["product"];
    Invoice: PrismaClient["invoice"];
    Estimate: PrismaClient["estimate"];
  },
  tenantId: string,
  resource: LimitResource,
  addCount = 1,
) {
  const sub = await entities.Subscriber.findFirst({
    where: { tenantId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });

  const limits = {
    customers: sub?.plan?.numberOfCustomers ?? 20,
    products: sub?.plan?.numberOfProducts ?? 20,
    invoices: sub?.plan?.numberOfInvoices ?? 50,
    estimates: sub?.plan?.numberOfEstimates ?? 50,
  };

  const counts: Record<LimitResource, number> = {
    customers: await entities.Customer.count({ where: { tenantId } }),
    products: await entities.Product.count({ where: { tenantId } }),
    invoices: await entities.Invoice.count({ where: { tenantId } }),
    estimates: await entities.Estimate.count({ where: { tenantId } }),
  };

  const limit = limits[resource];
  const current = counts[resource];
  if (current + addCount > limit) {
    throw new HttpError(
      403,
      `Plan limit reached for ${resource}: ${current}/${limit}. Upgrade your plan.`,
    );
  }
}

export async function userHasPermission(
  entities: {
    RoleUser: PrismaClient["roleUser"];
    User: PrismaClient["user"];
  },
  userId: string,
  permission: Permission,
): Promise<boolean> {
  const user = await entities.User.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.isAdmin || user.isSubscriber) return true;

  const roleUsers = await entities.RoleUser.findMany({
    where: { userId },
    include: { role: true },
  });
  if (!roleUsers.length) return true;

  for (const ru of roleUsers) {
    try {
      const perms = JSON.parse(ru.role.permissions) as string[];
      if (perms.includes(permission) || perms.includes("*")) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export async function assertPermission(
  entities: {
    RoleUser: PrismaClient["roleUser"];
    User: PrismaClient["user"];
  },
  userId: string,
  permission: Permission,
) {
  const ok = await userHasPermission(entities, userId, permission);
  if (!ok) {
    throw new HttpError(403, `Missing permission: ${permission}`);
  }
}
