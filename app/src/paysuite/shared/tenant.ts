import { HttpError } from "wasp/server";
import type { User } from "wasp/entities";
import type { PrismaClient } from "@prisma/client";

type AuthUser = User & { id: string };

/**
 * Ensures the authenticated user belongs to a tenant and returns tenantId.
 * Creates a default tenant for first-time users (company onboarding).
 */
export async function requireTenantId(
  user: AuthUser | undefined | null,
  entities: {
    User: PrismaClient["user"];
    Tenant: PrismaClient["tenant"];
    Plan: PrismaClient["plan"];
    Subscriber: PrismaClient["subscriber"];
  },
  opts?: { allowExpired?: boolean },
): Promise<string> {
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }

  if (user.tenantId) {
    // Block expired / suspended tenants (except admins / allowExpired ops like /plans)
    if (!user.isAdmin && !opts?.allowExpired) {
      const tenant = await entities.Tenant.findUnique({
        where: { id: user.tenantId },
      });
      if (tenant?.status === "suspended") {
        throw new HttpError(403, "Company account is suspended");
      }
      if (tenant?.status === "expired") {
        throw new HttpError(
          402,
          "Subscription expired. Activate a plan at /plans",
        );
      }
      // Soft-expire if latest paid sub endDate passed
      const sub = await entities.Subscriber.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: "desc" },
        include: { plan: true },
      });
      if (sub?.endDate && sub.endDate < new Date() && !sub.plan?.isFree) {
        await entities.Tenant.update({
          where: { id: user.tenantId },
          data: { status: "expired" },
        });
        throw new HttpError(
          402,
          "Subscription expired. Activate a plan at /plans",
        );
      }
    }
    return user.tenantId;
  }

  // Auto-provision tenant for new signups
  const slugBase =
    (user.username || user.email || "company")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "company";
  const slug = `${slugBase}-${user.id.slice(0, 8)}`;

  const tenant = await entities.Tenant.create({
    data: {
      slug,
      name: user.companyName || user.username || "My Company",
      status: "active",
    },
  });

  await entities.User.update({
    where: { id: user.id },
    data: { tenantId: tenant.id, isSubscriber: true },
  });

  // Attach default free plan if present
  const freePlan = await entities.Plan.findFirst({
    where: { isDefault: true, status: "active" },
  });
  if (freePlan) {
    await entities.Subscriber.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        tenantId: tenant.id,
        startDate: new Date(),
        endDate: null,
      },
    });
  }

  return tenant.id;
}

export function dueAmount(invoice: {
  grandTotal: number;
  receivedAmount: number;
}): number {
  return Math.max(0, invoice.grandTotal - (invoice.receivedAmount || 0));
}

export function computeLineTotals(
  lines: { quantity: number; price: number }[],
  discountType: string,
  discountAmount: number | null | undefined,
  taxRateTotal: number = 0,
) {
  const subTotal = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  let discount = 0;
  if (discountType === "fixed") {
    discount = discountAmount || 0;
  } else if (discountType === "percentage") {
    discount = (subTotal * (discountAmount || 0)) / 100;
  }
  const afterDiscount = Math.max(0, subTotal - discount);
  const taxAmount = (afterDiscount * taxRateTotal) / 100;
  const grandTotal = afterDiscount + taxAmount;
  return {
    subTotal,
    discountAmount: discount,
    totalAmount: afterDiscount,
    grandTotal,
    taxAmount,
  };
}

export function formatDocNumber(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(5, "0")}`;
}
