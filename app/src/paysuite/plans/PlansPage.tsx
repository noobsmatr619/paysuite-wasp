import { useEffect } from "react";
import {
  useQuery,
  getPlans,
  ensureDefaultPlans,
  getMyPlan,
  getBillings,
  activatePlan,
} from "wasp/client/operations";
import { PageShell, money, DataTable, StatusBadge } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Link } from "react-router";
import { useState } from "react";

export default function PlansPage() {
  const { data: plans, refetch } = useQuery(getPlans);
  const { data: myPlan, refetch: refetchMy } = useQuery(getMyPlan);
  const { data: billings, refetch: refetchBillings } = useQuery(getBillings);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!plans?.length) {
      ensureDefaultPlans()
        .then(() => {
          refetch();
          refetchMy();
        })
        .catch(() => undefined);
    }
  }, [plans?.length]);

  return (
    <PageShell
      title="Plans & billing"
      subtitle="Subscription plans, usage limits, and billing history"
      actions={
        <Button asChild variant="outline">
          <Link to="/pricing">Public pricing</Link>
        </Button>
      }
    >
      {myPlan?.subscriber?.plan && (
        <div className="bg-primary/5 border-primary/20 mb-6 rounded-xl border p-4">
          <div className="text-sm font-medium">Current plan</div>
          <div className="mt-1 text-xl font-semibold">
            {myPlan.subscriber.plan.name} ·{" "}
            {money(myPlan.subscriber.plan.price)}
          </div>
        </div>
      )}

      {msg && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {msg}
        </div>
      )}
      {err && <p className="mb-4 text-sm text-rose-600">{err}</p>}

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(plans || []).map((p: any) => (
          <div key={p.id} className="bg-card rounded-xl border p-4">
            <div className="text-lg font-semibold">{p.name}</div>
            <div className="text-muted-foreground text-sm capitalize">
              {p.frequency}
            </div>
            <div className="mt-3 text-2xl font-bold">
              {p.isFree ? "Free" : money(p.price)}
            </div>
            <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
              <li>{p.numberOfCustomers} customers</li>
              <li>{p.numberOfProducts} products</li>
              <li>{p.numberOfInvoices} invoices</li>
              <li>{p.numberOfEstimates} estimates</li>
            </ul>
            <Button
              className="mt-4 w-full"
              size="sm"
              onClick={async () => {
                setErr(null);
                try {
                  await activatePlan({ planId: p.id });
                  setMsg(`Activated ${p.name}`);
                  refetchMy();
                  refetchBillings();
                } catch (e: any) {
                  setErr(e?.message || "Activation failed");
                }
              }}
            >
              Activate
            </Button>
          </div>
        ))}
      </div>

      <h2 className="mb-3 font-semibold">Billing history</h2>
      <DataTable
        headers={["Invoice", "Plan", "Status", "Amount", "Date"]}
        empty={!billings?.length}
      >
        {(billings || []).map((b: any) => (
          <tr key={b.id}>
            <td className="px-4 py-2">{b.invoiceNumber}</td>
            <td className="px-4 py-2">{b.plan?.name}</td>
            <td className="px-4 py-2">
              <StatusBadge status={b.status} />
            </td>
            <td className="px-4 py-2">{money(b.amount)}</td>
            <td className="px-4 py-2">
              {new Date(b.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </DataTable>
    </PageShell>
  );
}
