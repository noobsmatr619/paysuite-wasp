import { HttpError } from "wasp/server";
import type { GetTenantReports, GetLandlordReports } from "wasp/server/operations";
import { requireTenantId } from "../shared/tenant";

export const getTenantReports: GetTenantReports<
  { year?: number },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = args?.year || new Date().getFullYear();
  const from = new Date(year, 0, 1);
  const to = new Date(year, 11, 31, 23, 59, 59);

  const [transactions, expenses, invoices] = await Promise.all([
    context.entities.Transaction.findMany({
      where: { tenantId, receivedOn: { gte: from, lte: to } },
    }),
    context.entities.Expense.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
    }),
    context.entities.Invoice.findMany({
      where: { tenantId, issueDate: { gte: from, lte: to } },
    }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: key, income: 0, expense: 0, invoiced: 0 };
  });

  for (const t of transactions) {
    const m = t.receivedOn.getMonth();
    months[m].income += t.amount;
  }
  for (const e of expenses) {
    const m = e.date.getMonth();
    months[m].expense += e.amount;
  }
  for (const inv of invoices) {
    const m = inv.issueDate.getMonth();
    months[m].invoiced += inv.grandTotal;
  }

  return {
    year,
    months,
    totals: {
      income: months.reduce((s, m) => s + m.income, 0),
      expense: months.reduce((s, m) => s + m.expense, 0),
      invoiced: months.reduce((s, m) => s + m.invoiced, 0),
    },
  };
};

/** Super-admin landlord overview across all tenants */
export const getLandlordReports: GetLandlordReports<void, any> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");

  const year = new Date().getFullYear();
  const from = new Date(year, 0, 1);

  const [tenants, subscribers, plans, tickets, billings, platformTx] =
    await Promise.all([
      context.entities.Tenant.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      context.entities.Subscriber.findMany({
        include: { plan: true, tenant: true, user: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      context.entities.Plan.findMany({ where: { status: "active" } }),
      context.entities.Ticket.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { department: true, priority: true, tenant: true },
      }),
      context.entities.BillingHistory.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { plan: true, tenant: true },
      }),
      context.entities.BillingHistory.findMany({
        where: { createdAt: { gte: from }, status: "paid" },
        select: { amount: true, createdAt: true },
      }),
    ]);

  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const mrr = subscribers.reduce((s, sub) => {
    if (!sub.plan) return s;
    const price =
      sub.plan.frequency === "yearly" ? sub.plan.price / 12 : sub.plan.price;
    return s + (price || 0);
  }, 0);

  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month: key, amount: 0 };
  });
  for (const b of platformTx) {
    const m = b.createdAt.getMonth();
    monthlyRevenue[m].amount += b.amount;
  }

  const ticketsByStatus = ["pending", "open", "solved", "rejected"].map(
    (status) => ({
      status,
      count: tickets.filter((t) => t.status === status).length,
    }),
  );

  return {
    companyInsights: {
      totalTenants: tenants.length,
      activeTenants,
      suspendedTenants: tenants.filter((t) => t.status === "suspended").length,
      expiredTenants: tenants.filter((t) => t.status === "expired").length,
      mrr,
      ytdBillingRevenue: platformTx.reduce((s, b) => s + b.amount, 0),
    },
    planSummary: plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      frequency: p.frequency,
      subscribers: subscribers.filter((s) => s.planId === p.id).length,
    })),
    monthlyRevenue,
    ticketsByStatus,
    recentTickets: tickets,
    recentBillings: billings,
    tenants,
  };
};
