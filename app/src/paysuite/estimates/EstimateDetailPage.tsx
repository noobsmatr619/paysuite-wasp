import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  useQuery,
  convertEstimateToInvoice,
  sendEstimateEmail,
  getEstimate,
  ensureEstimatePortalLink,
} from "wasp/client/operations";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/estimates/${est.id}/edit`}>Edit</Link>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const link = await ensureEstimatePortalLink({ id: est.id });
                const url = `${window.location.origin}${link.path}`;
                await navigator.clipboard.writeText(url);
                setMessage(`Portal link copied: ${url}`);
              } catch (e: any) {
                setError(e?.message || "Portal link failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Copy portal link
          </Button>
          <Button asChild variant="outline">
            <Link to={`/estimates/${est.id}/print`}>PDF / Print</Link>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await sendEstimateEmail({ id: est.id });
                setMessage(`Estimate emailed to ${res.to}`);
              } catch (e: any) {
                setError(e?.message || "Email failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Email customer
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const inv = await convertEstimateToInvoice({ id: est.id });
                window.location.href = `/invoices/${inv.id}`;
              } catch (e: any) {
                setError(e?.message || "Convert failed");
                setBusy(false);
              }
            }}
          >
            Convert to invoice
          </Button>
        </div>
      }
    >
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={est.status} />
        <span className="text-lg font-semibold">{money(est.grandTotal)}</span>
      </div>
      <DataTable
        headers={["Product", "Qty", "Price", "Total"]}
        empty={!est.details?.length}
      >
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
