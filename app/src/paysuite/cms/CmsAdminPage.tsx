import { useState } from "react";
import {
  useQuery,
  getCmsAdmin,
  createCmsFaq,
  deleteCmsFaq,
  createCmsTestimonial,
  deleteCmsTestimonial,
  upsertCmsContent,
  seedCmsDefaults,
} from "wasp/client/operations";
import { PageShell, DataTable } from "../shared/ui";
import { Button } from "../../client/components/ui/button";
import { Input } from "../../client/components/ui/input";
import { Textarea } from "../../client/components/ui/textarea";

export default function CmsAdminPage() {
  const { data, isLoading, error, refetch } = useQuery(getCmsAdmin) as {
    data: any;
    isLoading: boolean;
    error: any;
    refetch: () => void;
  };
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [tName, setTName] = useState("");
  const [tQuote, setTQuote] = useState("");
  const [hero, setHero] = useState("");
  const [chooseUsTitle, setChooseUsTitle] = useState("");
  const [chooseUsJson, setChooseUsJson] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [workJson, setWorkJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (error) {
    return (
      <PageShell title="CMS">
        <p className="text-sm text-rose-600">
          Admin only. Set ADMIN_EMAILS to your email and sign up.
        </p>
      </PageShell>
    );
  }

  if (isLoading || !data) {
    return (
      <PageShell title="CMS">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </PageShell>
    );
  }

  const heroExisting =
    data.contents?.find((c: any) => c.key === "hero_title")?.value || "";

  return (
    <PageShell
      title="Marketing CMS"
      subtitle="FAQs, testimonials, and site content (landlord)"
      actions={
        <Button
          variant="outline"
          onClick={async () => {
            await (seedCmsDefaults as any)();
            refetch();
            setMsg("Defaults seeded");
          }}
        >
          Seed defaults
        </Button>
      }
    >
      {msg && <p className="mb-4 text-sm text-emerald-700">{msg}</p>}

      <SectionHeadings
        contents={data.contents || []}
        onSaved={() => {
          setMsg("Section headings saved");
          refetch();
        }}
      />

      <section className="bg-card mb-8 space-y-2 rounded-xl border p-4">
        <h2 className="font-semibold">Hero title</h2>
        <Input
          defaultValue={heroExisting}
          value={hero || heroExisting}
          onChange={(e) => setHero(e.target.value)}
        />
        <Button
          size="sm"
          onClick={async () => {
            await upsertCmsContent({
              key: "hero_title",
              value: hero || heroExisting,
            });
            setMsg("Hero saved");
            refetch();
          }}
        >
          Save hero
        </Button>
      </section>

      <section className="bg-card mb-8 space-y-2 rounded-xl border p-4">
        <h2 className="font-semibold">Why choose us</h2>
        <Input
          placeholder="Section title"
          defaultValue={
            data.contents?.find((c: any) => c.key === "choose_us_title")
              ?.value || ""
          }
          value={
            chooseUsTitle ||
            data.contents?.find((c: any) => c.key === "choose_us_title")
              ?.value ||
            ""
          }
          onChange={(e) => setChooseUsTitle(e.target.value)}
        />
        <Textarea
          placeholder='JSON array: [{"title":"...","body":"..."}]'
          rows={5}
          defaultValue={
            data.contents?.find((c: any) => c.key === "choose_us_body")
              ?.value || ""
          }
          value={
            chooseUsJson ||
            data.contents?.find((c: any) => c.key === "choose_us_body")
              ?.value ||
            ""
          }
          onChange={(e) => setChooseUsJson(e.target.value)}
        />
        <Button
          size="sm"
          onClick={async () => {
            await upsertCmsContent({
              key: "choose_us_title",
              value:
                chooseUsTitle ||
                data.contents?.find((c: any) => c.key === "choose_us_title")
                  ?.value ||
                "Why choose us",
            });
            await upsertCmsContent({
              key: "choose_us_body",
              value:
                chooseUsJson ||
                data.contents?.find((c: any) => c.key === "choose_us_body")
                  ?.value ||
                "[]",
            });
            setMsg("Choose-us saved");
            refetch();
          }}
        >
          Save choose-us
        </Button>
      </section>

      <section className="bg-card mb-8 space-y-2 rounded-xl border p-4">
        <h2 className="font-semibold">How it works</h2>
        <Input
          placeholder="Section title"
          value={
            workTitle ||
            data.contents?.find((c: any) => c.key === "work_solution_title")
              ?.value ||
            ""
          }
          onChange={(e) => setWorkTitle(e.target.value)}
        />
        <Textarea
          placeholder='JSON array: [{"step":1,"title":"...","body":"..."}]'
          rows={5}
          value={
            workJson ||
            data.contents?.find((c: any) => c.key === "work_solution_body")
              ?.value ||
            ""
          }
          onChange={(e) => setWorkJson(e.target.value)}
        />
        <Button
          size="sm"
          onClick={async () => {
            await upsertCmsContent({
              key: "work_solution_title",
              value:
                workTitle ||
                data.contents?.find(
                  (c: any) => c.key === "work_solution_title",
                )?.value ||
                "How it works",
            });
            await upsertCmsContent({
              key: "work_solution_body",
              value:
                workJson ||
                data.contents?.find((c: any) => c.key === "work_solution_body")
                  ?.value ||
                "[]",
            });
            setMsg("Work solution saved");
            refetch();
          }}
        >
          Save work solution
        </Button>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">FAQs</h2>
        <div className="bg-card mb-3 grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
          <Input
            placeholder="Question"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Textarea
            placeholder="Answer"
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
          <Button
            onClick={async () => {
              await createCmsFaq({ question: q, answer: a });
              setQ("");
              setA("");
              refetch();
            }}
          >
            Add FAQ
          </Button>
        </div>
        <DataTable headers={["Question", "Answer", ""]} empty={!data.faqs?.length}>
          {(data.faqs || []).map((f: any) => (
            <tr key={f.id}>
              <td className="px-4 py-2 font-medium">{f.question}</td>
              <td className="px-4 py-2 max-w-md truncate">{f.answer}</td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await deleteCmsFaq({ id: f.id });
                    refetch();
                  }}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Testimonials</h2>
        <div className="bg-card mb-3 grid gap-2 rounded-xl border p-4 sm:grid-cols-2">
          <Input
            placeholder="Name"
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <Textarea
            placeholder="Quote"
            value={tQuote}
            onChange={(e) => setTQuote(e.target.value)}
          />
          <Button
            onClick={async () => {
              await createCmsTestimonial({ name: tName, quote: tQuote });
              setTName("");
              setTQuote("");
              refetch();
            }}
          >
            Add testimonial
          </Button>
        </div>
        <DataTable
          headers={["Name", "Quote", ""]}
          empty={!data.testimonials?.length}
        >
          {(data.testimonials || []).map((t: any) => (
            <tr key={t.id}>
              <td className="px-4 py-2 font-medium">{t.name}</td>
              <td className="px-4 py-2 max-w-md truncate">{t.quote}</td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await deleteCmsTestimonial({ id: t.id });
                    refetch();
                  }}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </PageShell>
  );
}

/**
 * Laravel landlord basic-settings: the heading and sub-heading for each
 * landing-page section. Laravel requires every field, so Save is blocked until
 * they are all filled, matching that validator.
 */
const HEADING_FIELDS: { key: string; label: string; max: number }[] = [
  { key: "work_solution_title", label: "Work solution title", max: 100 },
  { key: "work_solution_sub_title", label: "Work solution sub title", max: 190 },
  { key: "plan_title", label: "Plan title", max: 100 },
  { key: "plan_sub_title", label: "Plan sub title", max: 190 },
  { key: "testimonial_title", label: "Testimonial title", max: 100 },
  { key: "testimonial_sub_title", label: "Testimonial sub title", max: 190 },
  { key: "subscribe_title", label: "Subscribe title", max: 100 },
  { key: "subscribe_sub_title", label: "Subscribe sub title", max: 190 },
  { key: "subscribe_heading", label: "Subscribe heading", max: 190 },
  {
    key: "frequently_asked_question_title",
    label: "FAQ title",
    max: 100,
  },
];

function SectionHeadings({
  contents,
  onSaved,
}: {
  contents: any[];
  onSaved: () => void;
}) {
  const stored = (key: string) =>
    contents.find((c: any) => c.key === key)?.value || "";
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const valueOf = (key: string) => values[key] ?? stored(key);
  const tooLong = HEADING_FIELDS.filter(
    (f) => valueOf(f.key).length > f.max,
  );
  const empty = HEADING_FIELDS.filter((f) => !valueOf(f.key).trim());

  return (
    <section className="bg-card mb-8 space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Section headings</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {HEADING_FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-muted-foreground text-xs">
              {field.label} (max {field.max})
            </span>
            <Input
              value={valueOf(field.key)}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      {!!error && <p className="text-sm text-rose-600">{error}</p>}
      <Button
        size="sm"
        disabled={!!tooLong.length || !!empty.length}
        onClick={async () => {
          setError("");
          try {
            for (const field of HEADING_FIELDS) {
              await upsertCmsContent({
                key: field.key,
                value: valueOf(field.key).trim(),
              });
            }
            onSaved();
          } catch (e: any) {
            setError(e?.message || "Save failed");
          }
        }}
      >
        Save headings
      </Button>
      {(!!tooLong.length || !!empty.length) && (
        <p className="text-muted-foreground text-xs">
          {empty.length
            ? `${empty.length} field(s) still empty`
            : `${tooLong.length} field(s) over the limit`}
        </p>
      )}
    </section>
  );
}
