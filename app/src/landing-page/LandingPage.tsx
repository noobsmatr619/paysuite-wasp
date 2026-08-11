import { useQuery, getPublicCms } from "wasp/client/operations";
import ExamplesCarousel from "./components/ExamplesCarousel";
import FAQ from "./components/FAQ";
import FeaturesGrid from "./components/FeaturesGrid";
import Footer from "./components/Footer";
import Hero from "./components/Hero";
import Testimonials from "./components/Testimonials";
import {
  examples,
  faqs,
  features,
  footerNavigation,
  testimonials,
} from "./contentSections";
import AIReady from "./ExampleHighlightedFeature";

function parseJsonArray(raw?: string): any[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function LandingPage() {
  const { data: cms } = useQuery(getPublicCms) as { data: any };

  const cmsFaqs =
    cms?.faqs?.length > 0
      ? cms.faqs.map((f: any) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
        }))
      : faqs;

  const cmsTestimonials =
    cms?.testimonials?.length > 0
      ? cms.testimonials.map((t: any) => ({
          name: t.name,
          role: t.role || "",
          quote: t.quote,
          socialUrl: "#",
          avatarSrc: t.avatarUrl || undefined,
        }))
      : testimonials;

  const chooseItems = parseJsonArray(cms?.site?.choose_us_body);
  const workItems = parseJsonArray(cms?.site?.work_solution_body);

  return (
    <div className="bg-background text-foreground">
      <main className="isolate">
        <Hero />
        {(chooseItems.length > 0 || cms?.site?.choose_us_title) && (
          <section className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
              {cms?.site?.choose_us_title || "Why choose us"}
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {chooseItems.map((item: any, i: number) => (
                <div
                  key={i}
                  className="bg-card rounded-2xl border p-6 shadow-sm"
                >
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        {(workItems.length > 0 || cms?.site?.work_solution_title) && (
          <section className="bg-muted/40 mx-auto max-w-6xl px-6 py-16">
            <h2 className="mb-8 text-center text-3xl font-bold tracking-tight">
              {cms?.site?.work_solution_title || "How it works"}
            </h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {workItems.map((item: any, i: number) => (
                <li
                  key={i}
                  className="bg-card rounded-2xl border p-6 shadow-sm"
                >
                  <div className="text-primary mb-2 text-sm font-bold">
                    Step {item.step ?? i + 1}
                  </div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
        <ExamplesCarousel examples={examples} />
        <AIReady />
        <FeaturesGrid features={features} />
        <Testimonials testimonials={cmsTestimonials} />
        <FAQ faqs={cmsFaqs} />
      </main>
      <Footer footerNavigation={footerNavigation} />
    </div>
  );
}
