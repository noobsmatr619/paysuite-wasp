import { useParams } from "react-router";
import { useQuery, getEstimateDocument } from "wasp/client/operations";
import { PageShell } from "../shared/ui";

export default function EstimatePrintPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery(getEstimateDocument, {
    id: id!,
  });

  if (isLoading) {
    return (
      <PageShell title="Preparing PDF…">
        <p className="text-muted-foreground text-sm">Generating document…</p>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell title="PDF error">
        <p className="text-sm text-rose-600">Could not generate document.</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={data.fullNumber}
      subtitle="Print dialog → Save as PDF"
    >
      <iframe
        title={data.fullNumber}
        srcDoc={data.html}
        className="bg-card min-h-[80vh] w-full rounded-xl border"
      />
    </PageShell>
  );
}
