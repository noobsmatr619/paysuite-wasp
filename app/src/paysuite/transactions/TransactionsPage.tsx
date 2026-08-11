import { useQuery, getTransactions } from "wasp/client/operations";
import {
  PageShell,
  DataTable,
  money,
  customerName,
} from "../shared/ui";

export default function TransactionsPage() {
  const { data, isLoading } = useQuery(getTransactions, {});

  return (
    <PageShell
      title="Transactions"
      subtitle="Invoice payments received across your company"
    >
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={[
            "Receipt",
            "Customer",
            "Invoice",
            "Method",
            "Date",
            "Amount",
          ]}
          empty={!data?.length}
        >
          {(data || []).map((t: any) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-medium">
                {t.invoiceFullNumber || "—"}
              </td>
              <td className="px-4 py-3">{customerName(t.customer)}</td>
              <td className="px-4 py-3">
                {t.invoice?.invoiceFullNumber || "—"}
              </td>
              <td className="px-4 py-3">{t.paymentMethod?.name || "—"}</td>
              <td className="px-4 py-3">
                {new Date(t.receivedOn).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 font-semibold text-emerald-600">
                {money(t.amount)}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
