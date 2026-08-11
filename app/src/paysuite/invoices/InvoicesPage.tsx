import { useState } from "react";
import { Link } from "react-router";
import {
  useQuery,
  getInvoices,
  deleteInvoice,
  cloneInvoice,
} from "wasp/client/operations";
import {
  PageShell,
  DataTable,
  SearchField,
  StatusBadge,
  money,
  customerName,
  PrimaryLink,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading, refetch } = useQuery(getInvoices, {
    search: search || undefined,
    status: status || undefined,
  });

  return (
    <PageShell
      title="Invoices"
      subtitle="Create, send, collect, and track invoice payments"
      actions={<PrimaryLink to="/invoices/new">New invoice</PrimaryLink>}
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchField value={search} onChange={setSearch} />
        <select
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="due">Due</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={[
            "Number",
            "Customer",
            "Status",
            "Total",
            "Paid",
            "Due",
            "",
          ]}
          empty={!data?.length}
        >
          {(data || []).map((inv: any) => (
            <tr key={inv.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">
                <Link
                  className="text-primary hover:underline"
                  to={`/invoices/${inv.id}`}
                >
                  {inv.invoiceFullNumber}
                </Link>
              </td>
              <td className="px-4 py-3">{customerName(inv.customer)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={inv.status} />
              </td>
              <td className="px-4 py-3">{money(inv.grandTotal)}</td>
              <td className="px-4 py-3">{money(inv.receivedAmount)}</td>
              <td className="px-4 py-3 font-medium text-rose-600">
                {money(inv.dueAmount)}
              </td>
              <td className="space-x-1 px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await cloneInvoice({ id: inv.id });
                    refetch();
                  }}
                >
                  Clone
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Delete invoice?")) return;
                    await deleteInvoice({ id: inv.id });
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
