import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery, deleteCustomer } from "wasp/client/operations";
import { getCustomers } from "wasp/client/operations";
import {
  PageShell,
  DataTable,
  SearchField,
  StatusBadge,
  customerName,
  PrimaryLink,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery(getCustomers, {
    search: search || undefined,
  });

  const rows = useMemo(() => data || [], [data]);

  return (
    <PageShell
      title="Customers"
      subtitle="Manage your clients and portal access"
      actions={<PrimaryLink to="/customers/new">Add customer</PrimaryLink>}
    >
      <div className="mb-4">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search name, email, company…"
        />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Name", "Email", "Company", "Phone", "Status", ""]}
          empty={!rows.length}
        >
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">
                <Link
                  className="text-primary hover:underline"
                  to={`/customers/${c.id}`}
                >
                  {customerName(c)}
                </Link>
              </td>
              <td className="text-muted-foreground px-4 py-3">
                {c.email || "—"}
              </td>
              <td className="px-4 py-3">{c.companyName || "—"}</td>
              <td className="px-4 py-3">
                {[c.phoneCountry, c.phoneNumber].filter(Boolean).join(" ") ||
                  "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Delete this customer?")) return;
                    await deleteCustomer({ id: c.id });
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
