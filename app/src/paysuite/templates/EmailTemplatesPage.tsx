import { useEffect, useState } from "react";
import {
  useQuery,
  getEmailTemplateTypes,
  getEmailTemplate,
  updateEmailTemplate,
} from "wasp/client/operations";
import { PageShell } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";

/**
 * Laravel landlord email templates: the type list on the left grouped by
 * group_name, the selected template's editor on the right. Only the subject and
 * the custom body are editable — the shipped default stays as the fallback.
 */
export default function EmailTemplatesPage() {
  const { data: groups, isLoading, error } = useQuery(getEmailTemplateTypes) as {
    data: Record<string, { id: string; displayName: string }[]> | undefined;
    isLoading: boolean;
    error: any;
  };

  const [typeId, setTypeId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  const { data: template, refetch } = useQuery(
    getEmailTemplate,
    { typeId: typeId! },
    { enabled: !!typeId },
  ) as { data: any; refetch: () => void };

  useEffect(() => {
    setSubject(template?.subject ?? "");
    setContent(template?.customContent ?? template?.defaultContent ?? "");
    setMessage("");
  }, [template]);

  if (error) {
    return (
      <PageShell title="Email templates">
        <p className="text-sm text-rose-600">
          Admin only. Set ADMIN_EMAILS to your email.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Email templates"
      subtitle="Subject and body for every transactional email"
    >
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <div className="space-y-4">
            {Object.entries(groups || {}).map(([group, types]) => (
              <div key={group}>
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  {group}
                </p>
                <div className="flex flex-col gap-1">
                  {types.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTypeId(t.id)}
                      className={
                        t.id === typeId
                          ? "rounded-md bg-primary px-3 py-2 text-left text-sm text-primary-foreground"
                          : "hover:bg-muted rounded-md px-3 py-2 text-left text-sm"
                      }
                    >
                      {t.displayName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!Object.keys(groups || {}).length && (
              <p className="text-muted-foreground text-sm">
                No template types seeded yet.
              </p>
            )}
          </div>

          <div>
            {!typeId ? (
              <p className="text-muted-foreground text-sm">
                Pick a template to edit it.
              </p>
            ) : !template ? (
              <p className="text-muted-foreground text-sm">
                No template stored for this type yet.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
                <label className="block text-sm font-medium">Body</label>
                <textarea
                  className="border-input bg-background min-h-[280px] w-full rounded-md border p-3 font-mono text-sm"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      try {
                        await updateEmailTemplate({
                          id: template.id,
                          subject,
                          description: content,
                        });
                        setMessage("Template updated successfully");
                        refetch();
                      } catch (e: any) {
                        setMessage(e?.message || "Update failed");
                      }
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setContent(template.defaultContent ?? "")}
                  >
                    Reset to default
                  </Button>
                  {!!message && (
                    <span className="text-muted-foreground text-sm">{message}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
