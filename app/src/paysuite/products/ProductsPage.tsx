import { useState } from "react";
import { Link } from "react-router";
import { useQuery, deleteProduct, getProducts } from "wasp/client/operations";
import {
  PageShell,
  DataTable,
  SearchField,
  money,
  PrimaryLink,
} from "../shared/ui";
import { Button } from "../../client/components/ui/button";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery(getProducts, {
    search: search || undefined,
  });

  return (
    <PageShell
      title="Products"
      subtitle="Products and services for invoices and estimates"
      actions={<PrimaryLink to="/products/new">Add product</PrimaryLink>}
    >
      <div className="mb-4">
        <SearchField value={search} onChange={setSearch} />
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={["Name", "Code", "Category", "Unit", "Price", ""]}
          empty={!data?.length}
        >
          {(data || []).map((p: any) => (
            <tr key={p.id} className="hover:bg-muted/30">
              <td className="px-4 py-3 font-medium">
                <Link className="text-primary hover:underline" to={`/products/${p.id}/edit`}>
                  {p.name}
                </Link>
              </td>
              <td className="px-4 py-3">{p.code || "—"}</td>
              <td className="px-4 py-3">{p.category?.name || "—"}</td>
              <td className="px-4 py-3">{p.unit?.shortName || "—"}</td>
              <td className="px-4 py-3 font-medium">{money(p.price)}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Delete product?")) return;
                    await deleteProduct({ id: p.id });
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
