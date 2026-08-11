import { useState } from "react";
import { Link } from "react-router";
import {
  useQuery,
  getEstimates,
  deleteEstimate,
  convertEstimateToInvoice,
  changeEstimateStatus,
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

export default function EstimatesPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery(getEstimates, {
    search: search || undefined,
  });

  return (
    <PageShell
      title="Estimates"
      subtitle="Quotes that can convert to invoices"
      actions={<PrimaryLink to="/estimates/new">New estimate</PrimaryLink>}
    >
      <div className="mb-4">
        <SearchField value={search} onChange={setSearch} />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Number", "Customer", "Status", "Total", ""]}
          empty={!data?.length}
        >
          {(data || []).map((est: any) => (
            <tr key={est.id}>
              <td className="px-4 py-3 font-medium">
                <Link
                  className="text-primary hover:underline"
                  to={`/estimates/${est.id}`}
                >
                  {est.estimateFullNumber}
                </Link>
              </td>
              <td className="px-4 py-3">{customerName(est.customer)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={est.status} />
              </td>
              <td className="px-4 py-3">{money(est.grandTotal)}</td>
              <td className="space-x-1 px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await changeEstimateStatus({
                      id: est.id,
                      status: "approved",
                    });
                    refetch();
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const inv = await convertEstimateToInvoice({ id: est.id });
                    window.location.href = `/invoices/${inv.id}`;
                  }}
                >
                  To invoice
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Delete estimate?")) return;
                    await deleteEstimate({ id: est.id });
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
