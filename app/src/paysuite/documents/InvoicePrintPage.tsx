import { useEffect } from "react";
import { useParams } from "react-router";
import { useQuery, getInvoiceDocument } from "wasp/client/operations";
import { PageShell } from "../shared/ui";

export default function InvoicePrintPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery(getInvoiceDocument, {
    id: id!,
  });

  useEffect(() => {
    if (!data?.html) return;
    const blob = new Blob([data.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    // Fallback: also render inline
    return () => URL.revokeObjectURL(url);
  }, [data?.html]);

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
      subtitle="Print dialog → Save as PDF. A print-ready tab should open."
    >
      <iframe
        title={data.fullNumber}
        srcDoc={data.html}
        className="bg-card min-h-[80vh] w-full rounded-xl border"
      />
    </PageShell>
  );
}
