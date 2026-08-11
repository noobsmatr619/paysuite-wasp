import { useQuery } from "wasp/client/operations";
import { getLandlordReports } from "wasp/client/operations";
import { PageShell, StatCard, money, DataTable, StatusBadge } from "../shared/ui";

export default function LandlordReportsPage() {
  const { data, isLoading, error } = useQuery(getLandlordReports);

  if (error) {
    return (
      <PageShell title="Landlord dashboard">
        <p className="text-sm text-rose-600">
          Admin only. Sign in with an admin email listed in ADMIN_EMAILS.
        </p>
      </PageShell>
    );
  }

  if (isLoading || !data) {
    return (
      <PageShell title="Landlord dashboard">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  const c = data.companyInsights;

  return (
    <PageShell
      title="Landlord dashboard"
      subtitle="Super-admin company insights, plan summary, and tickets"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Companies" value={c.totalTenants} />
        <StatCard label="Active" value={c.activeTenants} tone="success" />
        <StatCard label="Suspended" value={c.suspendedTenants} tone="warning" />
        <StatCard label="MRR" value={money(c.mrr)} tone="success" />
      </div>

      <h2 className="mb-3 font-semibold">Plan summary</h2>
      <DataTable headers={["Plan", "Price", "Frequency", "Subscribers"]}>
        {data.planSummary.map((p: any) => (
          <tr key={p.id}>
            <td className="px-4 py-2 font-medium">{p.name}</td>
            <td className="px-4 py-2">{money(p.price)}</td>
            <td className="px-4 py-2 capitalize">{p.frequency}</td>
            <td className="px-4 py-2">{p.subscribers}</td>
          </tr>
        ))}
      </DataTable>

      <h2 className="mt-8 mb-3 font-semibold">Recent tickets</h2>
      <DataTable
        headers={["Subject", "Company", "Status", "Priority"]}
        empty={!data.recentTickets?.length}
      >
        {data.recentTickets.map((t: any) => (
          <tr key={t.id}>
            <td className="px-4 py-2">{t.subject}</td>
            <td className="px-4 py-2">{t.tenant?.name}</td>
            <td className="px-4 py-2">
              <StatusBadge status={t.status} />
            </td>
            <td className="px-4 py-2">{t.priority?.name}</td>
          </tr>
        ))}
      </DataTable>
    </PageShell>
  );
}
