import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useQuery,
  getInvoice,
  updateInvoice,
  getCustomers,
  getProducts,
  getTaxes,
} from "wasp/client/operations";
import { PageShell, money } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";

type Line = { productId: string; quantity: number; price: number };

export default function InvoiceEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: inv, isLoading } = useQuery(getInvoice, { id: id! });
  const { data: customers } = useQuery(getCustomers, {});
  const { data: products } = useQuery(getProducts, {});
  const { data: taxes } = useQuery(getTaxes);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");
  const [taxId, setTaxId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inv) return;
    setCustomerId(inv.customerId);
    setIssueDate(new Date(inv.issueDate).toISOString().slice(0, 10));
    setDueDate(new Date(inv.dueDate).toISOString().slice(0, 10));
    setReferenceNumber(inv.referenceNumber || "");
    setDiscountType(inv.discountType || "none");
    setDiscountAmount(String(inv.discountAmount || 0));
    setNote(inv.note || "");
    setLines(
      (inv.details || []).map((d: any) => ({
        productId: d.productId,
        quantity: d.quantity,
        price: d.price,
      })),
    );
    if (inv.taxes?.[0]?.taxId) setTaxId(inv.taxes[0].taxId);
  }, [inv]);

  const selectedTax = (taxes || []).find((t: any) => t.id === taxId);
  const preview = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.quantity * l.price, 0);
    let disc = 0;
    if (discountType === "fixed") disc = parseFloat(discountAmount) || 0;
    if (discountType === "percentage")
      disc = (sub * (parseFloat(discountAmount) || 0)) / 100;
    const after = Math.max(0, sub - disc);
    const tax = selectedTax ? (after * selectedTax.rate) / 100 : 0;
    return { sub, disc, tax, grand: after + tax };
  }, [lines, discountType, discountAmount, selectedTax]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.productId && l.quantity > 0);
      if (!validLines.length) throw new Error("Add at least one line");
      await updateInvoice({
        id,
        customerId,
        issueDate,
        dueDate,
        referenceNumber: referenceNumber || null,
        discountType,
        discountAmount: parseFloat(discountAmount) || 0,
        note: note || null,
        lines: validLines,
        taxes: selectedTax
          ? [{ taxId: selectedTax.id, rate: selectedTax.rate }]
          : [],
      });
      navigate(`/invoices/${id}`);
    } catch (err: any) {
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !inv) {
    return (
      <PageShell title="Edit invoice">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Edit ${inv.invoiceFullNumber}`}
      subtitle="Update lines, discount, tax, and dates"
    >
      <form
        onSubmit={onSubmit}
        className="bg-card mx-auto max-w-3xl space-y-5 rounded-xl border p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {(customers || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName || ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Issue date</Label>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setLines((l) => [...l, { productId: "", quantity: 1, price: 0 }])
              }
            >
              Add line
            </Button>
          </div>
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-4">
              <select
                className="border-input bg-background h-10 rounded-md border px-3 text-sm sm:col-span-2"
                value={line.productId}
                onChange={(e) => {
                  const p = (products || []).find(
                    (x: any) => x.id === e.target.value,
                  );
                  setLines((prev) =>
                    prev.map((l, idx) =>
                      idx === i
                        ? {
                            productId: e.target.value,
                            quantity: l.quantity,
                            price: p?.price || 0,
                          }
                        : l,
                    ),
                  );
                }}
              >
                <option value="">Product…</option>
                {(products || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                value={line.quantity}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, idx) =>
                      idx === i
                        ? { ...l, quantity: parseFloat(e.target.value) || 0 }
                        : l,
                    ),
                  )
                }
              />
              <Input
                type="number"
                value={line.price}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l, idx) =>
                      idx === i
                        ? { ...l, price: parseFloat(e.target.value) || 0 }
                        : l,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Discount type</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
            >
              <option value="none">None</option>
              <option value="fixed">Fixed</option>
              <option value="percentage">Percentage</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Discount</Label>
            <Input
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tax</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            >
              <option value="">None</option>
              {(taxes || []).map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rate}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Note</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="bg-muted/40 rounded-lg p-4 text-sm font-semibold">
          Grand total preview: {money(preview.grand)}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
