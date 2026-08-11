import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  useQuery,
  createCustomer,
  updateCustomer,
  getCustomer,
} from "wasp/client/operations";
import { PageShell } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";

export default function CustomerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { data } = useQuery(
    getCustomer,
    { id: id || "" },
    { enabled: isEdit && Boolean(id) } as any,
  );

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneCountry: "",
    phoneNumber: "",
    taxNo: "",
    companyName: "",
    address: "",
    status: "active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm({
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        phoneCountry: data.phoneCountry || "",
        phoneNumber: data.phoneNumber || "",
        taxNo: data.taxNo || "",
        companyName: data.companyName || "",
        address: data.address || "",
        status: data.status || "active",
      });
    }
  }, [data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await updateCustomer({ id, ...form });
        navigate(`/customers/${id}`);
      } else {
        const created = await createCustomer(form);
        navigate(`/customers/${created.id}`);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  }

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <PageShell
      title={isEdit ? "Edit customer" : "New customer"}
      subtitle="Customer profile used on invoices and estimates"
    >
      <form
        onSubmit={onSubmit}
        className="bg-card mx-auto max-w-2xl space-y-4 rounded-xl border p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name *">
            <Input value={form.firstName} onChange={set("firstName")} required />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={set("lastName")} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Company">
            <Input value={form.companyName} onChange={set("companyName")} />
          </Field>
          <Field label="Phone country">
            <Input value={form.phoneCountry} onChange={set("phoneCountry")} />
          </Field>
          <Field label="Phone number">
            <Input value={form.phoneNumber} onChange={set("phoneNumber")} />
          </Field>
          <Field label="Tax number">
            <Input value={form.taxNo} onChange={set("taxNo")} />
          </Field>
          <Field label="Status">
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.status}
              onChange={set("status")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Address">
          <Textarea value={form.address} onChange={set("address")} rows={3} />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save customer"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </PageShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
