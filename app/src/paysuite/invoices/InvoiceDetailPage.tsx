import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  useQuery,
  getInvoice,
  recordInvoicePayment,
  getPaymentMethods,
  createPaymentMethod,
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

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { data: inv, isLoading, refetch } = useQuery(getInvoice, { id: id! });
  const { data: methods, refetch: refetchMethods } = useQuery(getPaymentMethods);
  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState("");
  const [paying, setPaying] = useState(false);
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
      refetch();
    } catch (err: any) {
      setError(err?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <PageShell
      title={inv.invoiceFullNumber}
      subtitle={`Customer: ${customerName(inv.customer)}`}
      actions={
        <Button asChild variant="outline">
          <Link to="/invoices">Back to list</Link>
        </Button>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Info label="Status" value={<StatusBadge status={inv.status} />} />
        <Info label="Grand total" value={money(inv.grandTotal)} />
        <Info label="Received" value={money(inv.receivedAmount)} />
        <Info
          label="Due"
          value={
            <span className="text-rose-600 font-semibold">
              {money(inv.dueAmount)}
            </span>
          }
        />
      </div>

      <h2 className="mb-2 font-semibold">Line items</h2>
      <DataTable headers={["Product", "Qty", "Price", "Line total"]} empty={!inv.details?.length}>
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
          <h3 className="font-semibold">Record due payment</h3>
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

      {!!inv.transactions?.length && (
        <>
          <h2 className="mt-8 mb-2 font-semibold">Payments</h2>
          <DataTable headers={["Date", "Amount", "Method"]}>
            {inv.transactions.map((t: any) => (
              <tr key={t.id}>
                <td className="px-4 py-2">
                  {new Date(t.receivedOn).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">{money(t.amount)}</td>
                <td className="px-4 py-2">{t.paymentMethod?.name || "—"}</td>
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
