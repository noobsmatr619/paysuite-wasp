import { useQuery } from "wasp/client/operations";
import {
  getDashboardStats,
  getPaymentOverview,
  getIncomeExpenseOverview,
} from "wasp/client/operations";
import { Link } from "react-router";
import { PageShell, StatCard, money } from "../shared/ui";

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery(getDashboardStats);
  const { data: payments } = useQuery(getPaymentOverview, {});
  const { data: incomeExpense } = useQuery(getIncomeExpenseOverview, {});

  if (isLoading || !stats) {
    return (
      <PageShell title="Dashboard">
        <p className="text-muted-foreground text-sm">Loading dashboard…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Dashboard"
      subtitle="PaySuite billing overview for your company"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total revenue" value={money(stats.totalRevenue)} />
        <StatCard
          label="Total paid"
          value={money(stats.totalPaid)}
          tone="success"
        />
        <StatCard
          label="Total due"
          value={money(stats.totalDue)}
          tone="danger"
        />
        <StatCard
          label="Net income"
          value={money(stats.netIncome)}
          hint={`Expenses ${money(stats.totalExpenses)}`}
          tone="warning"
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={stats.customerCount} />
        <StatCard label="Invoices" value={stats.invoiceCount} />
        <StatCard label="Products" value={stats.productCount} />
        <StatCard label="Open tickets" value={stats.ticketCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-card rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent payments</h2>
            <Link
              to="/transactions"
              className="text-primary text-sm hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y text-sm">
            {(payments?.transactions || []).slice(0, 6).map((t: any) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">
                    {t.invoiceFullNumber || "Payment"}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t.customer
                      ? `${t.customer.firstName} ${t.customer.lastName || ""}`
                      : "—"}
                  </div>
                </div>
                <div className="font-semibold text-emerald-600">
                  {money(t.amount)}
                </div>
              </li>
            ))}
            {!payments?.transactions?.length && (
              <li className="text-muted-foreground py-4 text-center">
                No payments yet
              </li>
            )}
          </ul>
        </section>

        <section className="bg-card rounded-xl border p-4">
          <h2 className="mb-3 font-semibold">Income vs expense</h2>
          <ul className="space-y-2 text-sm">
            {(incomeExpense || []).slice(-6).map((row: any) => (
              <li
                key={row.month}
                className="bg-muted/40 flex items-center justify-between rounded-lg px-3 py-2"
              >
                <span className="font-medium">{row.month}</span>
                <span className="text-muted-foreground">
                  <span className="text-emerald-600">
                    +{money(row.income)}
                  </span>
                  {" / "}
                  <span className="text-rose-600">-{money(row.expense)}</span>
                </span>
              </li>
            ))}
            {!incomeExpense?.length && (
              <li className="text-muted-foreground py-4 text-center">
                No activity yet
              </li>
            )}
          </ul>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
          to="/invoices/new"
        >
          New invoice
        </Link>
        <Link
          className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
          to="/customers/new"
        >
          Add customer
        </Link>
        <Link
          className="border-border rounded-lg border px-4 py-2 text-sm font-medium"
          to="/products/new"
        >
          Add product
        </Link>
      </div>
    </PageShell>
  );
}
