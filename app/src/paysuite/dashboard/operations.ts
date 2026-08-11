import { HttpError } from "wasp/server";
import type {
  GetDashboardStats,
  GetPaymentOverview,
  GetIncomeExpenseOverview,
} from "wasp/server/operations";
import { requireTenantId } from "../shared/tenant";

export const getDashboardStats: GetDashboardStats<void, any> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const [
    customerCount,
    productCount,
    invoiceCount,
    estimateCount,
    expenseCount,
    ticketCount,
    invoices,
    expenses,
  ] = await Promise.all([
    context.entities.Customer.count({ where: { tenantId } }),
    context.entities.Product.count({ where: { tenantId } }),
    context.entities.Invoice.count({ where: { tenantId } }),
    context.entities.Estimate.count({ where: { tenantId } }),
    context.entities.Expense.count({ where: { tenantId } }),
    context.entities.Ticket.count({ where: { tenantId } }),
    context.entities.Invoice.findMany({
      where: { tenantId },
      select: {
        grandTotal: true,
        receivedAmount: true,
        status: true,
      },
    }),
    context.entities.Expense.findMany({
      where: { tenantId },
      select: { amount: true },
    }),
  ]);

  const totalRevenue = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = invoices.reduce((s, i) => s + (i.receivedAmount || 0), 0);
  const totalDue = Math.max(0, totalRevenue - totalPaid);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    customerCount,
    productCount,
    invoiceCount,
    estimateCount,
    expenseCount,
    ticketCount,
    totalRevenue,
    totalPaid,
    totalDue,
    totalExpenses,
    netIncome: totalPaid - totalExpenses,
    paidInvoices: invoices.filter((i) => i.status === "paid").length,
    dueInvoices: invoices.filter((i) => i.status === "due").length,
    partialInvoices: invoices.filter((i) => i.status === "partially_paid")
      .length,
  };
};

export const getPaymentOverview: GetPaymentOverview<
  { rangeType?: string },
  any
> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const transactions = await context.entities.Transaction.findMany({
    where: { tenantId },
    orderBy: { receivedOn: "desc" },
    take: 50,
    include: {
      customer: true,
      paymentMethod: true,
      invoice: true,
    },
  });

  const byMonth: Record<string, number> = {};
  for (const t of transactions) {
    const key = t.receivedOn.toISOString().slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + t.amount;
  }

  return {
    transactions,
    chart: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount })),
  };
};

export const getIncomeExpenseOverview: GetIncomeExpenseOverview<
  { rangeType?: string },
  any
> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  const [transactions, expenses] = await Promise.all([
    context.entities.Transaction.findMany({
      where: { tenantId },
      select: { amount: true, receivedOn: true },
    }),
    context.entities.Expense.findMany({
      where: { tenantId },
      select: { amount: true, date: true },
    }),
  ]);

  const map: Record<string, { income: number; expense: number }> = {};
  for (const t of transactions) {
    const k = t.receivedOn.toISOString().slice(0, 7);
    map[k] = map[k] || { income: 0, expense: 0 };
    map[k].income += t.amount;
  }
  for (const e of expenses) {
    const k = e.date.toISOString().slice(0, 7);
    map[k] = map[k] || { income: 0, expense: 0 };
    map[k].expense += e.amount;
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
};
