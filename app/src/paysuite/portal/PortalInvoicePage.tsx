import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { useQuery, getPortalInvoice, createPortalCheckout } from "wasp/client/operations";
import { money, StatusBadge } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { useState } from "react";

export default function PortalInvoicePage() {
  const { token } = useParams();
  const [search] = useSearchParams();
  const { data, isLoading, error, refetch } = useQuery(
    getPortalInvoice,
    { token: token || "" },
    { enabled: Boolean(token) } as any,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(
    search.get("paid") === "1"
      ? "Payment submitted. Status updates when the processor confirms."
      : null,
  );

  const paidBanner = useMemo(
    () => data?.status === "paid" || (data?.dueAmount ?? 1) <= 0,
    [data],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <p className="text-muted-foreground text-sm">Loading invoice…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-bold">Invoice not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This portal link is invalid or has been revoked.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">{data.companyName}</p>
        <h1 className="text-2xl font-bold tracking-tight">
          Invoice {data.invoiceFullNumber}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={data.status} />
          <span className="text-muted-foreground text-sm">
            Due {new Date(data.dueDate).toLocaleDateString()}
          </span>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          {msg}
        </div>
      )}
      {paidBanner && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800">
          This invoice is paid. Thank you.
        </div>
      )}

      <div className="bg-card mb-6 rounded-xl border p-4">
        <div className="text-muted-foreground text-xs uppercase">Bill to</div>
        <div className="mt-1 font-medium">
          {[data.customer.firstName, data.customer.lastName]
            .filter(Boolean)
            .join(" ") || data.customer.companyName}
        </div>
        {data.customer.email && (
          <div className="text-muted-foreground text-sm">{data.customer.email}</div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.lines.map((l: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-2">{l.name}</td>
                <td className="px-4 py-2 text-right">{l.quantity}</td>
                <td className="px-4 py-2 text-right">{money(l.price)}</td>
                <td className="px-4 py-2 text-right">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(data.subTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid</span>
          <span>{money(data.receivedAmount)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Amount due</span>
          <span className={data.dueAmount > 0 ? "text-rose-600" : ""}>
            {money(data.dueAmount)}
          </span>
        </div>
      </div>

      {data.dueAmount > 0 && (
        <div className="mt-6">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const res = await createPortalCheckout({ token: token! });
                if (res.url) {
                  window.location.href = res.url;
                  return;
                }
                setMsg(
                  res.message ||
                    "Card checkout is not available. Please contact the company to arrange payment.",
                );
                refetch();
              } catch (e: any) {
                setMsg(e?.message || "Could not start checkout");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Starting checkout…" : "Pay online"}
          </Button>
        </div>
      )}

      {!!data.payments?.length && (
        <div className="mt-8">
          <h2 className="mb-2 font-semibold">Payments received</h2>
          <ul className="space-y-2 text-sm">
            {data.payments.map((p: any) => (
              <li
                key={p.id}
                className="bg-muted/40 flex justify-between rounded-lg px-3 py-2"
              >
                <span>{new Date(p.receivedOn).toLocaleDateString()}</span>
                <span className="font-medium text-emerald-600">
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground mt-10 text-xs">
        Secure customer portal · powered by PaySuite
      </p>
    </div>
  );
}
