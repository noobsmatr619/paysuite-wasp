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
      include: { customer: true },
    }),
    context.entities.Expense.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      include: { category: true },
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

  // Laravel serves these as expense-category-chart and
  // payment-customer-summary; both were missing here.
  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    const name = (expense as any).category?.name ?? "Uncategorised";
    byCategory.set(name, (byCategory.get(name) ?? 0) + expense.amount);
  }
  const expenseByCategory = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);

  const byCustomer = new Map<string, { name: string; amount: number; count: number }>();
  for (const transaction of transactions) {
    const customer = (transaction as any).customer;
    const key = customer?.id ?? "unknown";
    const name = customer
      ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || "Customer"
      : "Unattributed";
    const entry = byCustomer.get(key) ?? { name, amount: 0, count: 0 };
    entry.amount += transaction.amount;
    entry.count += 1;
    byCustomer.set(key, entry);
  }
  const paymentsByCustomer = [...byCustomer.values()].sort((a, b) => b.amount - a.amount);

  return {
    year,
    months,
    expenseByCategory,
    paymentsByCustomer,
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

/**
 * Report endpoints Laravel serves that had no Wasp equivalent:
 * income-expense-summary, income-yearly-chart, expense-yearly-chart,
 * payment-yearly-summary, invoice-overview, exist-mail-setup and
 * role-without-users.
 *
 * Laravel counts income as paid invoices by issue_date, and expense by date;
 * the monthly buckets and the profit column follow that.
 */
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function yearBounds(year: number) {
  return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59) };
}

/** Monthly income, expense and profit — Laravel incomeExpenseSummary(). */
export const getIncomeExpenseSummary: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = Number(args?.year) || new Date().getFullYear();
  const { from, to } = yearBounds(year);

  const [invoices, expenses] = await Promise.all([
    context.entities.Invoice.findMany({
      where: { tenantId, status: "paid", issueDate: { gte: from, lte: to } },
    }),
    context.entities.Expense.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
    }),
  ]);

  const months = MONTH_LABELS.map((label, i) => ({
    month: label,
    monthNumber: i + 1,
    income: 0,
    expense: 0,
    profit: 0,
  }));

  for (const invoice of invoices) months[new Date(invoice.issueDate).getMonth()].income += invoice.grandTotal;
  for (const expense of expenses) months[new Date(expense.date).getMonth()].expense += expense.amount;
  for (const m of months) m.profit = Math.round((m.income - m.expense) * 100) / 100;

  return {
    year,
    months,
    totals: {
      income: months.reduce((s, m) => s + m.income, 0),
      expense: months.reduce((s, m) => s + m.expense, 0),
      profit: months.reduce((s, m) => s + m.profit, 0),
    },
  };
};

/** Paid invoice totals per month — Laravel income yearlyChart(). */
export const getIncomeYearlyChart: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = Number(args?.year) || new Date().getFullYear();
  const { from, to } = yearBounds(year);

  const invoices = await context.entities.Invoice.findMany({
    where: { tenantId, status: "paid", issueDate: { gte: from, lte: to } },
  });
  const months = MONTH_LABELS.map((label) => ({ month: label, total: 0 }));
  for (const invoice of invoices) months[new Date(invoice.issueDate).getMonth()].total += invoice.grandTotal;
  return { year, months };
};

/** Expense totals per month — Laravel expense yearlyChart(). */
export const getExpenseYearlyChart: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = Number(args?.year) || new Date().getFullYear();
  const { from, to } = yearBounds(year);

  const expenses = await context.entities.Expense.findMany({
    where: { tenantId, date: { gte: from, lte: to } },
  });
  const months = MONTH_LABELS.map((label) => ({ month: label, total: 0 }));
  for (const expense of expenses) months[new Date(expense.date).getMonth()].total += expense.amount;
  return { year, months };
};

/** Received payments per month — Laravel payment yearlySummary(). */
export const getPaymentYearlySummary: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = Number(args?.year) || new Date().getFullYear();
  const { from, to } = yearBounds(year);

  const transactions = await context.entities.Transaction.findMany({
    where: { tenantId, receivedOn: { gte: from, lte: to } },
  });
  const months = MONTH_LABELS.map((label) => ({ month: label, total: 0, count: 0 }));
  for (const t of transactions) {
    const m = months[new Date(t.receivedOn).getMonth()];
    m.total += t.amount;
    m.count += 1;
  }
  return {
    year,
    months,
    totals: {
      amount: months.reduce((s, m) => s + m.total, 0),
      count: months.reduce((s, m) => s + m.count, 0),
    },
  };
};

/** Invoice counts and value by status — Laravel invoiceOverview(). */
export const getInvoiceOverview: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const year = Number(args?.year) || new Date().getFullYear();
  const { from, to } = yearBounds(year);

  const invoices = await context.entities.Invoice.findMany({
    where: { tenantId, issueDate: { gte: from, lte: to } },
  });

  const byStatus = new Map<string, { status: string; count: number; total: number; due: number }>();
  for (const invoice of invoices) {
    const row = byStatus.get(invoice.status) ?? {
      status: invoice.status,
      count: 0,
      total: 0,
      due: 0,
    };
    row.count += 1;
    row.total += invoice.grandTotal;
    row.due += Math.max(0, invoice.grandTotal - invoice.receivedAmount);
    byStatus.set(invoice.status, row);
  }

  return {
    year,
    statuses: [...byStatus.values()].sort((a, b) => b.total - a.total),
    totals: {
      count: invoices.length,
      value: invoices.reduce((s: number, i: any) => s + i.grandTotal, 0),
      due: invoices.reduce((s: number, i: any) => s + Math.max(0, i.grandTotal - i.receivedAmount), 0),
    },
  };
};

/**
 * Whether outgoing mail is configured — Laravel isExists(), which answers 1/0.
 * The provider is Dummy until real SMTP credentials are set, so this reports
 * what is configured rather than claiming delivery works.
 */
export const getMailSetupExists: any = async (_args: void, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities, { allowExpired: true });
  const row = await context.entities.Customization.findFirst({
    where: { tenantId, key: "email_settings" },
  });
  let configured = false;
  try {
    const value = row?.value ? JSON.parse(row.value) : null;
    configured = Boolean(value && value.host && value.from_address);
  } catch {
    configured = false;
  }
  return { exists: configured ? 1 : 0, configured };
};

/** Roles with nobody assigned — Laravel roleWithoutUsers(), used before delete. */
export const getRolesWithoutUsers: any = async (_args: void, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const roles = await context.entities.Role.findMany({ where: { tenantId } });
  if (!roles.length) return [];

  const assignments = await context.entities.RoleUser.findMany({
    where: { roleId: { in: roles.map((r: any) => r.id) } },
  });
  const used = new Set(assignments.map((a: any) => a.roleId));
  return roles
    .filter((role: any) => !used.has(role.id))
    .map((role: any) => ({ id: role.id, name: role.name, description: role.description }));
};
