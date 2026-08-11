import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useQuery,
  getEstimate,
  updateEstimate,
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

export default function EstimateEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: est, isLoading } = useQuery(getEstimate, { id: id! });
  const { data: customers } = useQuery(getCustomers, {});
  const { data: products } = useQuery(getProducts, {});
  const { data: taxes } = useQuery(getTaxes);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState("");
  const [discountType, setDiscountType] = useState("none");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [note, setNote] = useState("");
  const [taxId, setTaxId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!est) return;
    setCustomerId(est.customerId);
    setDate(new Date(est.date).toISOString().slice(0, 10));
    setDiscountType(est.discountType || "none");
    setDiscountAmount(String(est.discountAmount || 0));
    setNote(est.note || "");
    setLines(
      (est.details || []).map((d: any) => ({
        productId: d.productId,
        quantity: d.quantity,
        price: d.price,
      })),
    );
    if (est.taxes?.[0]?.taxId) setTaxId(est.taxes[0].taxId);
  }, [est]);

  const selectedTax = (taxes || []).find((t: any) => t.id === taxId);
  const preview = useMemo(() => {
    const sub = lines.reduce((s, l) => s + l.quantity * l.price, 0);
    let disc = 0;
    if (discountType === "fixed") disc = parseFloat(discountAmount) || 0;
    if (discountType === "percentage")
      disc = (sub * (parseFloat(discountAmount) || 0)) / 100;
    const after = Math.max(0, sub - disc);
    const tax = selectedTax ? (after * selectedTax.rate) / 100 : 0;
    return { grand: after + tax };
  }, [lines, discountType, discountAmount, selectedTax]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.productId && l.quantity > 0);
      await updateEstimate({
        id,
        customerId,
        date,
        discountType,
        discountAmount: parseFloat(discountAmount) || 0,
        note: note || null,
        lines: validLines,
        taxes: selectedTax
          ? [{ taxId: selectedTax.id, rate: selectedTax.rate }]
          : [],
      });
      navigate(`/estimates/${id}`);
    } catch (err: any) {
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !est) {
    return (
      <PageShell title="Edit estimate">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell title={`Edit ${est.estimateFullNumber}`}>
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
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <Label>Lines</Label>
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
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="font-semibold">Preview: {money(preview.grand)}</div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save estimate"}
        </Button>
      </form>
    </PageShell>
  );
}
