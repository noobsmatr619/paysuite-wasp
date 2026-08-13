import {
  useQuery,
  getNewsletterSubscribers,
  deleteNewsletterSubscriber,
} from "wasp/client/operations";
import { PageShell, DataTable } from "../shared/ui";
import { Button } from "../../client/components/ui/button";

/** Laravel landlord `news-latter` — the list of newsletter subscribers. */
export default function NewsletterPage() {
  const { data, isLoading, error, refetch } = useQuery(
    getNewsletterSubscribers,
  ) as {
    data: { id: string; email: string; createdAt: string }[] | undefined;
    isLoading: boolean;
    error: any;
    refetch: () => void;
  };

  if (error) {
    return (
      <PageShell title="Newsletter">
        <p className="text-sm text-rose-600">
          Admin only. Set ADMIN_EMAILS to your email.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Newsletter subscribers"
      subtitle="Everyone who signed up from the marketing site"
    >
      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" onClick={() => refetch()}>
          Refresh
        </Button>
        <span className="text-muted-foreground text-sm">
          {data?.length ?? 0} subscriber{data?.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <DataTable headers={["Email", "Subscribed", "Actions"]} empty={!data?.length}>
          {(data || []).map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2 font-medium">{row.email}</td>
              <td className="px-4 py-2 text-sm">
                {new Date(row.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await deleteNewsletterSubscriber({ id: row.id });
                    refetch();
                  }}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </PageShell>
  );
}
