import { useQuery } from "wasp/client/operations";
import { getTenantReports } from "wasp/client/operations";
import { PageShell, StatCard, money, DataTable } from "../shared/ui";

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const { data, isLoading } = useQuery(getTenantReports, { year });

  if (isLoading || !data) {
    return (
      <PageShell title="Reports">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Income & expense reports"
      subtitle={`Year ${data.year} — tenant financial summary`}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Income"
          value={money(data.totals.income)}
          tone="success"
        />
        <StatCard
          label="Expenses"
          value={money(data.totals.expense)}
          tone="danger"
        />
        <StatCard
          label="Invoiced"
          value={money(data.totals.invoiced)}
          tone="warning"
        />
      </div>

      <DataTable headers={["Month", "Income", "Expense", "Invoiced", "Net"]}>
        {data.months.map((m: any) => (
          <tr key={m.month}>
            <td className="px-4 py-2 font-medium">{m.month}</td>
            <td className="px-4 py-2 text-emerald-600">{money(m.income)}</td>
            <td className="px-4 py-2 text-rose-600">{money(m.expense)}</td>
            <td className="px-4 py-2">{money(m.invoiced)}</td>
            <td className="px-4 py-2 font-semibold">
              {money(m.income - m.expense)}
            </td>
          </tr>
        ))}
      </DataTable>
    </PageShell>
  );
}
