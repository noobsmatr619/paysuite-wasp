import { HttpError } from "wasp/server";

export const getPublicCms: any = async (_args: void, context: any) => {
  const [faqs, testimonials, contents] = await Promise.all([
    context.entities.CmsFaq.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
    }),
    context.entities.CmsTestimonial.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
    }),
    context.entities.CmsSiteContent.findMany(),
  ]);
  const site: Record<string, string> = {};
  for (const c of contents) site[c.key] = c.value;
  return { faqs, testimonials, site };
};

export const getCmsAdmin: any = async (_args: void, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  const [faqs, testimonials, contents] = await Promise.all([
    context.entities.CmsFaq.findMany({ orderBy: { sortOrder: "asc" } }),
    context.entities.CmsTestimonial.findMany({ orderBy: { sortOrder: "asc" } }),
    context.entities.CmsSiteContent.findMany(),
  ]);
  return { faqs, testimonials, contents };
};

export const upsertCmsContent: any = async (args: any, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  return context.entities.CmsSiteContent.upsert({
    where: { key: args.key },
    create: { key: args.key, value: args.value },
    update: { value: args.value },
  });
};

export const createCmsFaq: any = async (args: any, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  const count = await context.entities.CmsFaq.count();
  return context.entities.CmsFaq.create({
    data: {
      question: args.question,
      answer: args.answer,
      sortOrder: count,
    },
  });
};

export const deleteCmsFaq: any = async (args: any, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  return context.entities.CmsFaq.delete({ where: { id: args.id } });
};

export const createCmsTestimonial: any = async (args: any, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  const count = await context.entities.CmsTestimonial.count();
  return context.entities.CmsTestimonial.create({
    data: {
      name: args.name,
      role: args.role || null,
      quote: args.quote,
      sortOrder: count,
    },
  });
};

export const deleteCmsTestimonial: any = async (args: any, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  return context.entities.CmsTestimonial.delete({ where: { id: args.id } });
};

export const seedCmsDefaults: any = async (_args: void, context: any) => {
  if (!context.user?.isAdmin) throw new HttpError(403, "Admin only");
  if ((await context.entities.CmsFaq.count()) === 0) {
    await context.entities.CmsFaq.createMany({
      data: [
        {
          question: "What is PaySuite?",
          answer:
            "Multi-tenant invoicing, estimates, expenses, and subscription billing.",
          sortOrder: 0,
        },
        {
          question: "Can customers pay online?",
          answer:
            "Yes — share a portal link. Stripe card pay or external PayPal/Razorpay references.",
          sortOrder: 1,
        },
      ],
    });
  }
  if ((await context.entities.CmsTestimonial.count()) === 0) {
    await context.entities.CmsTestimonial.create({
      data: {
        name: "Alex Founder",
        role: "SaaS CEO",
        quote: "PaySuite replaced our spreadsheet chaos in a week.",
        sortOrder: 0,
      },
    });
  }
  const defaults: Record<string, string> = {
    hero_title: "Invoicing & billing for growing teams",
    hero_subtitle:
      "Multi-tenant invoices, estimates, expenses, support tickets, and SaaS plans — web + mobile.",
    contact_email: "hello@paysuite.app",
    choose_us_title: "Why choose PaySuite",
    choose_us_body:
      JSON.stringify([
        {
          title: "Multi-tenant ready",
          body: "Isolated company workspaces with plan limits and roles.",
        },
        {
          title: "Customer portal",
          body: "Share secure invoice links with Stripe or external PSP references.",
        },
        {
          title: "Mobile API",
          body: "JWT mobile surface matching Flutter auth, CRUD, and billing.",
        },
      ]),
    work_solution_title: "How it works",
    work_solution_body:
      JSON.stringify([
        {
          step: 1,
          title: "Sign up",
          body: "Create your company workspace and pick a plan.",
        },
        {
          step: 2,
          title: "Bill customers",
          body: "Send invoices and estimates; collect payments online.",
        },
        {
          step: 3,
          title: "Grow",
          body: "Track expenses, tickets, and team roles as you scale.",
        },
      ]),
  };
  for (const [key, value] of Object.entries(defaults)) {
    await context.entities.CmsSiteContent.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }
  return getCmsAdmin(undefined as any, context);
};
