import { useState } from "react";
import {
  exportCustomersCsv,
  exportProductsCsv,
  exportInvoicesCsv,
  importCustomersCsv,
  importProductsCsv,
} from "wasp/client/operations";
import { PageShell } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Textarea } from "../../client/components/ui/textarea";

function download(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportExportPage() {
  const [paste, setPaste] = useState("");
  const [log, setLog] = useState<string | null>(null);

  return (
    <PageShell
      title="Import / Export"
      subtitle="CSV import and export for customers, products, and invoices"
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const { csv } = await exportCustomersCsv();
            download("customers.csv", csv);
          }}
        >
          Export customers
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const { csv } = await exportProductsCsv();
            download("products.csv", csv);
          }}
        >
          Export products
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const { csv } = await exportInvoicesCsv();
            download("invoices.csv", csv);
          }}
        >
          Export invoices
        </Button>
      </div>

      <div className="bg-card max-w-3xl space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">Import CSV</h2>
        <p className="text-muted-foreground text-sm">
          Paste CSV with header row. Customers: firstName,lastName,email,...
          Products: name,price,code,description
        </p>
        <Textarea
          rows={10}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="firstName,lastName,email&#10;Ada,Lovelace,ada@example.com"
        />
        <div className="flex gap-2">
          <Button
            onClick={async () => {
              const res = await importCustomersCsv({ csv: paste });
              setLog(
                `Customers imported: ${res.imported}. Errors: ${res.errors.join("; ") || "none"}`,
              );
            }}
          >
            Import customers
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await importProductsCsv({ csv: paste });
              setLog(
                `Products imported: ${res.imported}. Errors: ${res.errors.join("; ") || "none"}`,
              );
            }}
          >
            Import products
          </Button>
        </div>
        {log && <p className="text-sm">{log}</p>}
      </div>
    </PageShell>
  );
}
