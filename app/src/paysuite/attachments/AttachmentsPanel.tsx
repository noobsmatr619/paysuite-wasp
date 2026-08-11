import { useRef, useState } from "react";
import {
  useQuery,
  listAttachments,
  createAttachment,
  deleteAttachment,
  getAttachment,
} from "wasp/client/operations";
import { Button } from "../../client/components/ui/button";

export function AttachmentsPanel({
  ownerType,
  ownerId,
}: {
  ownerType: "expense" | "ticket" | "invoice" | "estimate";
  ownerId: string;
}) {
  const { data, isLoading, refetch } = useQuery(listAttachments, {
    ownerType,
    ownerId,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const contentBase64 = btoa(binary);
      await createAttachment({
        ownerType,
        ownerId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        contentBase64,
      });
      refetch();
    } catch (e: any) {
      setError(e?.message || "Upload failed (max ~1.5MB)");
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string, fileName: string) {
    const row = await getAttachment({ id });
    const bin = atob(row.contentBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: row.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-card mt-6 rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Attachments</h3>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !data?.length ? (
        <p className="text-muted-foreground text-sm">No files yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {data.map((a: any) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <button
                type="button"
                className="text-primary truncate text-left hover:underline"
                onClick={() => download(a.id, a.fileName)}
              >
                {a.fileName}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {Math.round(a.sizeBytes / 1024)} KB
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await deleteAttachment({ id: a.id });
                    refetch();
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
