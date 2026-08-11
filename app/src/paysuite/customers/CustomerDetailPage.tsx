import { Link, useParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getCustomer } from "wasp/client/operations";
import {
  PageShell,
  StatusBadge,
  money,
  customerName,
  DataTable,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { data: c, isLoading } = useQuery(getCustomer, { id: id! });

  if (isLoading || !c) {
    return (
      <PageShell title="Customer">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={customerName(c)}
      subtitle={c.email || c.companyName || "Customer details"}
      actions={
        <Button asChild variant="outline">
          <Link to={`/customers/${c.id}/edit`}>Edit</Link>
        </Button>
      }
    >
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Status" value={<StatusBadge status={c.status} />} />
        <Info label="Company" value={c.companyName || "—"} />
        <Info
          label="Phone"
          value={
            [c.phoneCountry, c.phoneNumber].filter(Boolean).join(" ") || "—"
          }
        />
        <Info label="Tax no." value={c.taxNo || "—"} />
      </div>
      {c.address && (
        <p className="text-muted-foreground mb-8 text-sm">{c.address}</p>
      )}

      <h2 className="mb-3 font-semibold">Invoices</h2>
      <DataTable
        headers={["Number", "Status", "Total", "Due"]}
        empty={!c.invoices?.length}
      >
        {c.invoices?.map((inv: any) => (
          <tr key={inv.id}>
            <td className="px-4 py-2">
              <Link className="text-primary hover:underline" to={`/invoices/${inv.id}`}>
                {inv.invoiceFullNumber}
              </Link>
            </td>
            <td className="px-4 py-2">
              <StatusBadge status={inv.status} />
            </td>
            <td className="px-4 py-2">{money(inv.grandTotal)}</td>
            <td className="px-4 py-2">
              {money(inv.grandTotal - inv.receivedAmount)}
            </td>
          </tr>
        ))}
      </DataTable>
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
