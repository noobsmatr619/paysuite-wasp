import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useQuery,
  createProduct,
  updateProduct,
  getProduct,
  getCategories,
  getUnits,
  createCategory,
  createUnit,
} from "wasp/client/operations";
import { PageShell } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { data } = useQuery(
    getProduct,
    { id: id || "" },
    { enabled: isEdit && Boolean(id) } as any,
  );
  const { data: categories, refetch: refetchCats } = useQuery(getCategories, {
    type: "category",
  });
  const { data: units, refetch: refetchUnits } = useQuery(getUnits);

  const [form, setForm] = useState({
    name: "",
    price: "0",
    code: "",
    description: "",
    categoryId: "",
    unitId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name || "",
        price: String(data.price ?? 0),
        code: data.code || "",
        description: data.description || "",
        categoryId: data.categoryId || "",
        unitId: data.unitId || "",
      });
    }
  }, [data]);

  async function ensureLookups() {
    if (!categories?.length) {
      await createCategory({ name: "General", type: "category" });
      await refetchCats();
    }
    if (!units?.length) {
      await createUnit({ name: "Piece", shortName: "pc" });
      await refetchUnits();
    }
  }

  useEffect(() => {
    ensureLookups().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        price: parseFloat(form.price) || 0,
        code: form.code || null,
        description: form.description || null,
        categoryId: form.categoryId || null,
        unitId: form.unitId || null,
      };
      if (isEdit && id) {
        await updateProduct({ id, ...payload });
      } else {
        await createProduct(payload);
      }
      navigate("/products");
    } catch (err: any) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell title={isEdit ? "Edit product" : "New product"}>
      <form
        onSubmit={onSubmit}
        className="bg-card mx-auto max-w-xl space-y-4 rounded-xl border p-6"
      >
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Price *</Label>
            <Input
              type="number"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">—</option>
              {(categories || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.unitId}
              onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            >
              <option value="">—</option>
              {(units || []).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.shortName})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save product"}
        </Button>
      </form>
    </PageShell>
  );
}
