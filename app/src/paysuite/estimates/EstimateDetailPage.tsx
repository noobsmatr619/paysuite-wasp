import { Link, useParams } from "react-router";
import { useQuery, convertEstimateToInvoice } from "wasp/client/operations";
import { getEstimate } from "wasp/client/operations";
import {
  PageShell,
  StatusBadge,
  money,
  customerName,
  DataTable,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";

export default function EstimateDetailPage() {
  const { id } = useParams();
  const { data: est, isLoading } = useQuery(getEstimate, { id: id! });

  if (isLoading || !est) {
    return (
      <PageShell title="Estimate">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={est.estimateFullNumber}
      subtitle={`Customer: ${customerName(est.customer)}`}
      actions={
        <Button
          onClick={async () => {
            const inv = await convertEstimateToInvoice({ id: est.id });
            window.location.href = `/invoices/${inv.id}`;
          }}
        >
          Convert to invoice
        </Button>
      }
    >
      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={est.status} />
        <span className="text-lg font-semibold">{money(est.grandTotal)}</span>
      </div>
      <DataTable headers={["Product", "Qty", "Price", "Total"]} empty={!est.details?.length}>
        {est.details?.map((d: any) => (
          <tr key={d.id}>
            <td className="px-4 py-2">{d.product?.name}</td>
            <td className="px-4 py-2">{d.quantity}</td>
            <td className="px-4 py-2">{money(d.price)}</td>
            <td className="px-4 py-2">{money(d.quantity * d.price)}</td>
          </tr>
        ))}
      </DataTable>
      <div className="mt-4">
        <Button asChild variant="outline">
          <Link to="/estimates">Back</Link>
        </Button>
      </div>
    </PageShell>
  );
}
