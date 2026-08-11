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
