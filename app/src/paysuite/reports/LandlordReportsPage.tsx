import { useMemo } from "react";
import { useQuery, getLandlordReports } from "wasp/client/operations";
import {
  PageShell,
  StatCard,
  money,
  DataTable,
  StatusBadge,
} from "../shared/ui";

// ApexCharts is already a project dependency (OpenSaaS analytics).
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

export default function LandlordReportsPage() {
  const { data, isLoading, error } = useQuery(getLandlordReports);

  const revenueOptions: ApexOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false }, fontFamily: "inherit" },
      stroke: { curve: "smooth", width: 3 },
      dataLabels: { enabled: false },
      xaxis: {
        categories: (data?.monthlyRevenue || []).map((m: any) => m.month),
      },
      colors: ["#0f766e"],
      yaxis: {
        labels: {
          formatter: (v) => `$${Math.round(v)}`,
        },
      },
    }),
    [data?.monthlyRevenue],
  );

  const planOptions: ApexOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false }, fontFamily: "inherit" },
      labels: (data?.planSummary || []).map((p: any) => p.name),
      legend: { position: "bottom" },
      colors: ["#0f766e", "#0284c7", "#7c3aed", "#d97706"],
    }),
    [data?.planSummary],
  );

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
      subtitle="Super-admin company insights, plan summary, revenue charts, and tickets"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Companies" value={c.totalTenants} />
        <StatCard label="Active" value={c.activeTenants} tone="success" />
        <StatCard label="Suspended" value={c.suspendedTenants} tone="warning" />
        <StatCard label="MRR" value={money(c.mrr)} tone="success" />
        <StatCard
          label="YTD plan billing"
          value={money(c.ytdBillingRevenue || 0)}
        />
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="bg-card rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">Platform billing revenue</h2>
          <Chart
            type="area"
            height={260}
            options={revenueOptions}
            series={[
              {
                name: "Revenue",
                data: (data.monthlyRevenue || []).map((m: any) => m.amount),
              },
            ]}
          />
        </div>
        <div className="bg-card rounded-xl border p-4">
          <h2 className="mb-2 font-semibold">Subscribers by plan</h2>
          <Chart
            type="donut"
            height={260}
            options={planOptions}
            series={(data.planSummary || []).map((p: any) => p.subscribers)}
          />
        </div>
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

      <h2 className="mt-8 mb-3 font-semibold">Recent company billings</h2>
      <DataTable
        headers={["Invoice", "Company", "Plan", "Status", "Amount"]}
        empty={!data.recentBillings?.length}
      >
        {(data.recentBillings || []).map((b: any) => (
          <tr key={b.id}>
            <td className="px-4 py-2">{b.invoiceNumber}</td>
            <td className="px-4 py-2">{b.tenant?.name}</td>
            <td className="px-4 py-2">{b.plan?.name}</td>
            <td className="px-4 py-2">
              <StatusBadge status={b.status} />
            </td>
            <td className="px-4 py-2">{money(b.amount)}</td>
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

      <h2 className="mt-8 mb-3 font-semibold">Companies</h2>
      <DataTable
        headers={["Name", "Slug", "Status"]}
        empty={!data.tenants?.length}
      >
        {(data.tenants || []).map((t: any) => (
          <tr key={t.id}>
            <td className="px-4 py-2 font-medium">{t.name}</td>
            <td className="px-4 py-2">{t.slug}</td>
            <td className="px-4 py-2">
              <StatusBadge status={t.status} />
            </td>
          </tr>
        ))}
      </DataTable>
    </PageShell>
  );
}
