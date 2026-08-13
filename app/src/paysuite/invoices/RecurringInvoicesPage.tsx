import { Link } from "react-router";
import { useQuery, getInvoices } from "wasp/client/operations";
import {
  PageShell,
  DataTable,
  StatusBadge,
  money,
  customerName,
  PrimaryLink,
} from "../shared/ui";

const INTERVAL_LABEL: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/**
 * Laravel RecurringInvoiceController::index — the invoices set to repeat.
 * Generated copies carry referenceNumber "recurring-of-<id>", so they are
 * filtered out: this lists the series, not its output.
 */
export default function RecurringInvoicesPage() {
  const { data, isLoading } = useQuery(getInvoices, { recurring: true });

  const rows = (data || []).filter(
    (invoice: any) =>
      !String(invoice.referenceNumber ?? "").startsWith("recurring-of-"),
  );

  return (
    <PageShell
      title="Recurring invoices"
      subtitle="Invoices that repeat automatically on a weekly, monthly or yearly cycle"
      actions={<PrimaryLink to="/invoices/new">New invoice</PrimaryLink>}
    >
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Number", "Customer", "Interval", "Issued", "Next due", "Total", "Status"]}
          empty={!rows.length}
        >
          {rows.map((invoice: any) => (
            <tr key={invoice.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">
                <Link
                  className="text-primary hover:underline"
                  to={`/invoices/${invoice.id}`}
                >
                  {invoice.invoiceFullNumber}
                </Link>
              </td>
              <td className="px-4 py-3">{customerName(invoice.customer)}</td>
              <td className="px-4 py-3">
                {INTERVAL_LABEL[invoice.recurringInterval ?? "monthly"] ?? "Monthly"}
              </td>
              <td className="px-4 py-3">
                {new Date(invoice.issueDate).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                {new Date(invoice.dueDate).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">{money(invoice.grandTotal)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={invoice.status} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
