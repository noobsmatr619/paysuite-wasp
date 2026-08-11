import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  useQuery,
  createInvoice,
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

export default function InvoiceFormPage() {
  const navigate = useNavigate();
  const { data: customers } = useQuery(getCustomers, {});
  const { data: products } = useQuery(getProducts, {});
  const { data: taxes } = useQuery(getTaxes);

  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(due);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");
  const [taxId, setTaxId] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { productId: "", quantity: 1, price: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function onProductChange(i: number, productId: string) {
    const p = (products || []).find((x: any) => x.id === productId);
    updateLine(i, { productId, price: p?.price || 0 });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.productId && l.quantity > 0);
      if (!customerId) throw new Error("Select a customer");
      if (!validLines.length) throw new Error("Add at least one product line");

      const created = await createInvoice({
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
      navigate(`/invoices/${created.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title="New invoice" subtitle="Line items, tax, and discounts">
      <form
        onSubmit={onSubmit}
        className="bg-card mx-auto max-w-3xl space-y-5 rounded-xl border p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <select
              required
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select…</option>
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
                onChange={(e) => onProductChange(i, e.target.value)}
              >
                <option value="">Product…</option>
                {(products || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({money(p.price)})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.quantity}
                onChange={(e) =>
                  updateLine(i, { quantity: parseFloat(e.target.value) || 0 })
                }
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={line.price}
                onChange={(e) =>
                  updateLine(i, { price: parseFloat(e.target.value) || 0 })
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
            <Label>Discount amount</Label>
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

        <div className="bg-muted/40 rounded-lg p-4 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(preview.sub)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{money(preview.disc)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{money(preview.tax)}</span>
          </div>
          <div className="mt-2 flex justify-between text-base font-semibold">
            <span>Grand total</span>
            <span>{money(preview.grand)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Creating…" : "Create invoice"}
        </Button>
      </form>
    </PageShell>
  );
}
