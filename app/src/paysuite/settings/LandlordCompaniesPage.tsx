import { useState } from "react";
import {
  useQuery,
  getLandlordCompanies,
  updateLandlordCompany,
} from "wasp/client/operations";
import { PageShell, DataTable, StatusBadge } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";

export default function LandlordCompaniesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { data, isLoading, error, refetch } = useQuery(getLandlordCompanies, {
    search: search || undefined,
    status: status || undefined,
  }) as {
    data: any[] | undefined;
    isLoading: boolean;
    error: any;
    refetch: () => void;
  };

  if (error) {
    return (
      <PageShell title="Companies">
        <p className="text-sm text-rose-600">
          Admin only. Set ADMIN_EMAILS to your email.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Landlord companies"
      subtitle="All tenant workspaces — filter, suspend, soft-delete"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          className="border-input bg-background h-10 rounded-md border px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable
          headers={[
            "Company",
            "Status",
            "Users",
            "Customers",
            "Invoices",
            "Plan",
            "Actions",
          ]}
          empty={!data?.length}
        >
          {(data || []).map((t: any) => (
            <tr key={t.id}>
              <td className="px-4 py-2">
                <div className="font-medium">{t.name}</div>
                <div className="text-muted-foreground text-xs">{t.slug}</div>
              </td>
              <td className="px-4 py-2">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-2">{t._count?.users ?? 0}</td>
              <td className="px-4 py-2">{t._count?.customers ?? 0}</td>
              <td className="px-4 py-2">{t._count?.invoices ?? 0}</td>
              <td className="px-4 py-2 text-sm">
                {t.subscribers?.[0]?.plan?.name || "—"}
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await updateLandlordCompany({
                        id: t.id,
                        status: "active",
                      });
                      refetch();
                    }}
                  >
                    Activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await updateLandlordCompany({
                        id: t.id,
                        status: "suspended",
                      });
                      refetch();
                    }}
                  >
                    Suspend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        !confirm(
                          `Soft-delete company ${t.name}? Data is kept but hidden.`,
                        )
                      )
                        return;
                      await updateLandlordCompany({
                        id: t.id,
                        isDeleted: true,
                      });
                      refetch();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
