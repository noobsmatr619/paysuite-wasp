import { useState } from "react";
import {
  useQuery,
  getExpenses,
  deleteExpense,
  createExpense,
  getCategories,
  createCategory,
} from "wasp/client/operations";
import { PageShell, DataTable, SearchField, money } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery(getExpenses, {
    search: search || undefined,
  });
  const { data: categories, refetch: refetchCats } = useQuery(getCategories, {
    type: "expense",
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    categoryId: "",
    reference: "",
    note: "",
  });

  async function ensureExpenseCategory() {
    if (!categories?.length) {
      await createCategory({ name: "General expense", type: "expense" });
      await refetchCats();
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    await ensureExpenseCategory();
    const cats = await refetchCats();
    const categoryId =
      form.categoryId || cats.data?.[0]?.id || categories?.[0]?.id;
    if (!categoryId) return;
    await createExpense({
      title: form.title,
      date: form.date,
      amount: parseFloat(form.amount) || 0,
      categoryId,
      reference: form.reference || null,
      note: form.note || null,
    });
    setShowForm(false);
    setForm({
      title: "",
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      categoryId: "",
      reference: "",
      note: "",
    });
    refetch();
  }

  return (
    <PageShell
      title="Expenses"
      subtitle="Track company expenses by category"
      actions={
        <Button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close" : "Add expense"}
        </Button>
      }
    >
      {showForm && (
        <form
          onSubmit={onCreate}
          className="bg-card mb-6 grid max-w-2xl gap-3 rounded-xl border p-4 sm:grid-cols-2"
        >
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Amount</Label>
            <Input
              required
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <select
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={form.categoryId}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value })
              }
            >
              <option value="">Default</option>
              {(categories || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save expense</Button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <SearchField value={search} onChange={setSearch} />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Title", "Date", "Category", "Amount", ""]}
          empty={!data?.length}
        >
          {(data || []).map((e: any) => (
            <tr key={e.id}>
              <td className="px-4 py-3 font-medium">{e.title}</td>
              <td className="px-4 py-3">
                {new Date(e.date).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">{e.category?.name || "—"}</td>
              <td className="px-4 py-3">{money(e.amount)}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Delete expense?")) return;
                    await deleteExpense({ id: e.id });
                    refetch();
                  }}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
