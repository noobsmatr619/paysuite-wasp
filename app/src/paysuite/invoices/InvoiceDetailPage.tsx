import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  useQuery,
  getInvoice,
  recordInvoicePayment,
  getPaymentMethods,
  createPaymentMethod,
  createInvoiceCheckoutSession,
  createGatewayPaymentIntent,
  sendInvoiceEmail,
  getInvoicePdf,
  ensureInvoicePortalLink,
  updateInvoice,
  cloneInvoice,
} from "wasp/client/operations";
import {
  PageShell,
  StatusBadge,
  money,
  customerName,
  DataTable,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { AttachmentsPanel } from "../attachments/AttachmentsPanel";

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { data: inv, isLoading, refetch } = useQuery(getInvoice, { id: id! });
  const { data: methods, refetch: refetchMethods } = useQuery(getPaymentMethods);
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    search.get("paid") === "1"
      ? "Stripe payment completed. Refresh if totals look stale."
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !inv) {
    return (
      <PageShell title="Invoice">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  async function ensureCash() {
    if (!methods?.length) {
      await createPaymentMethod({ name: "Cash", type: "cash" });
      await refetchMethods();
    }
  }

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      await ensureCash();
      await recordInvoicePayment({
        id: inv.id,
        amount: parseFloat(amount),
        paymentMethodId: methodId || methods?.[0]?.id || null,
      });
      setAmount("");
      setMessage("Payment recorded");
      refetch();
    } catch (err: any) {
      setError(err?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  async function stripeCollect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await createInvoiceCheckoutSession({ id: inv.id });
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (err: any) {
      setError(
        err?.message ||
          "Stripe checkout failed. Ensure STRIPE_API_KEY is configured.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function emailInvoice() {
    setBusy(true);
    setError(null);
    try {
      const res = await sendInvoiceEmail({ id: inv.id });
      setMessage(`Invoice emailed to ${res.to}`);
    } catch (err: any) {
      setError(err?.message || "Email failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title={inv.invoiceFullNumber}
      subtitle={`Customer: ${customerName(inv.customer)}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/invoices/${inv.id}/edit`}>Edit</Link>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const link = await ensureInvoicePortalLink({ id: inv.id });
                const url = `${window.location.origin}${link.path}`;
                await navigator.clipboard.writeText(url);
                setMessage(`Customer portal link copied: ${url}`);
              } catch (e: any) {
                setError(e?.message || "Could not create portal link");
              } finally {
                setBusy(false);
              }
            }}
          >
            Copy portal link
          </Button>
          <Button asChild variant="outline">
            <Link to={`/invoices/${inv.id}/print`}>Print HTML</Link>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const pdf = await getInvoicePdf({ id: inv.id });
                const bin = atob(pdf.base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const blob = new Blob([bytes], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = pdf.filename;
                a.click();
                URL.revokeObjectURL(url);
                setMessage("PDF downloaded");
              } catch (e: any) {
                setError(e?.message || "PDF failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Download PDF
          </Button>
          <Button variant="outline" disabled={busy} onClick={emailInvoice}>
            Email customer
          </Button>
          {inv.dueAmount > 0 && (
            <>
              <Button disabled={busy} onClick={stripeCollect}>
                Collect via Stripe
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const intent = await createGatewayPaymentIntent({
                      id: inv.id,
                      gateway: "paypal",
                    });
                    if (intent.url) window.open(intent.url, "_blank");
                    setMessage(intent.instructions);
                  } catch (e: any) {
                    setError(e?.message || "PayPal intent failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                PayPal
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const intent = await createGatewayPaymentIntent({
                      id: inv.id,
                      gateway: "razorpay",
                    });
                    setMessage(
                      `${intent.instructions} Ref: ${intent.reference}`,
                    );
                  } catch (e: any) {
                    setError(e?.message || "Razorpay intent failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Razorpay
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await updateInvoice({
                  id: inv.id,
                  recurring: !inv.recurring,
                } as any);
                setMessage(
                  inv.recurring
                    ? "Recurring disabled"
                    : "Recurring enabled (monthly job clones when due)",
                );
                refetch();
              } catch (e: any) {
                setError(e?.message || "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {inv.recurring ? "Disable recurring" : "Enable recurring"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const clone = await cloneInvoice({ id: inv.id });
                setMessage(`Cloned as ${clone.invoiceFullNumber}`);
                window.location.href = `/invoices/${clone.id}`;
              } catch (e: any) {
                setError(e?.message || "Clone failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Clone
          </Button>
          <Button asChild variant="ghost">
            <Link to="/invoices">Back</Link>
          </Button>
        </div>
      }
    >
      {message && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Info label="Status" value={<StatusBadge status={inv.status} />} />
        <Info label="Grand total" value={money(inv.grandTotal)} />
        <Info label="Received" value={money(inv.receivedAmount)} />
        <Info
          label="Due"
          value={
            <span className="font-semibold text-rose-600">
              {money(inv.dueAmount)}
            </span>
          }
        />
      </div>

      <h2 className="mb-2 font-semibold">Line items</h2>
      <DataTable
        headers={["Product", "Qty", "Price", "Line total"]}
        empty={!inv.details?.length}
      >
        {inv.details?.map((d: any) => (
          <tr key={d.id}>
            <td className="px-4 py-2">{d.product?.name}</td>
            <td className="px-4 py-2">{d.quantity}</td>
            <td className="px-4 py-2">{money(d.price)}</td>
            <td className="px-4 py-2">{money(d.quantity * d.price)}</td>
          </tr>
        ))}
      </DataTable>

      {inv.dueAmount > 0 && (
        <div className="bg-card mt-8 max-w-md space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">Record manual payment</h3>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              placeholder={String(inv.dueAmount)}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
            >
              <option value="">Default</option>
              {(methods || []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button onClick={pay} disabled={paying || !amount}>
            {paying ? "Recording…" : "Record payment"}
          </Button>
        </div>
      )}

      {error && inv.dueAmount <= 0 && (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      )}

      <AttachmentsPanel ownerType="invoice" ownerId={inv.id} />

      {!!inv.transactions?.length && (
        <>
          <h2 className="mt-8 mb-2 font-semibold">Payments</h2>
          <DataTable headers={["Date", "Amount", "Method", "Note"]}>
            {inv.transactions.map((t: any) => (
              <tr key={t.id}>
                <td className="px-4 py-2">
                  {new Date(t.receivedOn).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">{money(t.amount)}</td>
                <td className="px-4 py-2">{t.paymentMethod?.name || "—"}</td>
                <td className="px-4 py-2">{t.note || "—"}</td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
