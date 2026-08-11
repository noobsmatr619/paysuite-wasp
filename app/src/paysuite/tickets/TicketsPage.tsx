import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  useQuery,
  getTickets,
  createTicket,
  getDepartments,
  getPriorities,
  ensureSupportLookups,
  updateTicketStatus,
} from "wasp/client/operations";
import { PageShell, DataTable, StatusBadge, PrimaryLink } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Label } from "../../client/components/ui/label";
import { Textarea } from "../../client/components/ui/textarea";

export default function TicketsPage() {
  const { data, isLoading, refetch } = useQuery(getTickets, {});
  const { data: departments, refetch: refetchDept } = useQuery(getDepartments);
  const { data: priorities, refetch: refetchPri } = useQuery(getPriorities);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    departmentId: "",
    priorityId: "",
    body: "",
  });

  useEffect(() => {
    ensureSupportLookups()
      .then(() => {
        refetchDept();
        refetchPri();
      })
      .catch(() => undefined);
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const departmentId = form.departmentId || departments?.[0]?.id;
    const priorityId = form.priorityId || priorities?.[0]?.id;
    if (!departmentId || !priorityId) {
      alert("Wait for departments/priorities to load (or seed them).");
      return;
    }
    await createTicket({
      subject: form.subject,
      departmentId,
      priorityId,
      body: form.body || null,
    });
    setShow(false);
    setForm({ subject: "", departmentId: "", priorityId: "", body: "" });
    refetch();
  }

  return (
    <PageShell
      title="Support tickets"
      subtitle="Departments, priorities, comments, and ratings"
      actions={
        <Button onClick={() => setShow((s) => !s)}>
          {show ? "Close" : "New ticket"}
        </Button>
      }
    >
      {show && (
        <form
          onSubmit={onCreate}
          className="bg-card mb-6 max-w-xl space-y-3 rounded-xl border p-4"
        >
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Department</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={form.departmentId}
                onChange={(e) =>
                  setForm({ ...form, departmentId: e.target.value })
                }
              >
                {(departments || []).map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <select
                className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
                value={form.priorityId}
                onChange={(e) =>
                  setForm({ ...form, priorityId: e.target.value })
                }
              >
                {(priorities || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <Button type="submit">Create ticket</Button>
        </form>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Subject", "Department", "Priority", "Status", ""]}
          empty={!data?.length}
        >
          {(data || []).map((t: any) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-medium">
                <Link
                  className="text-primary hover:underline"
                  to={`/tickets/${t.id}`}
                >
                  {t.subject}
                </Link>
              </td>
              <td className="px-4 py-3">{t.department?.name}</td>
              <td className="px-4 py-3">{t.priority?.name}</td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await updateTicketStatus({ id: t.id, status: "open" });
                    refetch();
                  }}
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
