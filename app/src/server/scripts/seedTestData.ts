import type { PrismaClient } from "@prisma/client";

/**
 * Full business-domain seed for PaySuite — creates a realistic multi-tenant
 * scenario with customers, invoices, estimates, expenses, tickets, etc.
 *
 * Run AFTER seedPaySuiteDefaults (which creates Plans, Departments, Priorities,
 * and Email Templates).
 *
 * Usage:
 *   1. Add to main.wasp db.seeds:
 *        import { seedTestData } from "@src/server/scripts/seedTestData"
 *   2. wasp db seed
 *
 * Does NOT modify existing files.
 */
export async function seedTestData(prismaClient: PrismaClient) {
  // ── Guard ──────────────────────────────────────────────────────────────────
  const tenantCount = await prismaClient.tenant.count();
  if (tenantCount > 0) {
    console.log("[seedTestData] Business data already present, skipping.");
    return;
  }

  // ── Resolve existing seeded entities ───────────────────────────────────────
  const businessPlan = await prismaClient.plan.findFirst({
    where: { tag: "business" },
  });
  const freePlan = await prismaClient.plan.findFirst({
    where: { tag: "free" },
  });
  if (!businessPlan || !freePlan) {
    console.log("[seedTestData] Run seedPaySuiteDefaults first — plans missing.");
    return;
  }

  const departments = await prismaClient.department.findMany();
  const priorities = await prismaClient.priority.findMany();
  if (departments.length === 0 || priorities.length === 0) {
    console.log("[seedTestData] Run seedPaySuiteDefaults first — departments/priorities missing.");
    return;
  }

  // ── Admin User (platform super-admin) ──────────────────────────────────────
  const adminUser = await prismaClient.user.create({
    data: {
      email: "admin@paysuite.local",
      username: "admin_paysuite",
      isAdmin: true,
      firstName: "Platform",
      lastName: "Admin",
      status: "active",
    },
  });

  // ── Tenant (Demo Company) ──────────────────────────────────────────────────
  const tenant = await prismaClient.tenant.create({
    data: {
      slug: "acme-corp",
      name: "Acme Corp",
      status: "active",
    },
  });

  // ── Owner User (tenant owner) ──────────────────────────────────────────────
  const ownerUser = await prismaClient.user.create({
    data: {
      email: "owner@acme.local",
      username: "owner_acme",
      isAdmin: false,
      firstName: "Fatima",
      lastName: "Owens",
      companyName: "Acme Corp",
      status: "active",
      tenantId: tenant.id,
      isSubscriber: true,
    },
  });

  // ── Team Member (invited user) ─────────────────────────────────────────────
  const teamUser = await prismaClient.user.create({
    data: {
      email: "accountant@acme.local",
      username: "accountant_acme",
      isAdmin: false,
      firstName: "Ben",
      lastName: "Numbers",
      status: "active",
      tenantId: tenant.id,
    },
  });

  // ── User Profiles ──────────────────────────────────────────────────────────
  await prismaClient.userProfile.createMany({
    data: [
      {
        userId: ownerUser.id,
        firstName: "Fatima",
        lastName: "Owens",
        gender: "female",
        phoneNumber: "5550200",
        phoneCountry: "+1",
        address: "123 Business Ave, Suite 100",
        portalAccess: true,
      },
      {
        userId: teamUser.id,
        firstName: "Ben",
        lastName: "Numbers",
        gender: "male",
        phoneNumber: "5550201",
        phoneCountry: "+1",
        address: "456 Finance St",
      },
    ],
  });

  // ── RBAC: Role + Assignment ────────────────────────────────────────────────
  const ownerRole = await prismaClient.role.create({
    data: {
      tenantId: tenant.id,
      name: "Owner",
      description: "Full access to all tenant features",
      permissions: JSON.stringify([
        "manage_customers", "manage_products", "manage_invoices",
        "manage_estimates", "manage_expenses", "manage_transactions",
        "manage_tickets", "manage_settings", "manage_team",
        "view_reports", "manage_taxes",
      ]),
    },
  });
  const accountantRole = await prismaClient.role.create({
    data: {
      tenantId: tenant.id,
      name: "Accountant",
      description: "Invoice, expense, and transaction management",
      permissions: JSON.stringify([
        "manage_invoices", "manage_expenses", "manage_transactions",
        "view_reports", "manage_taxes",
      ]),
    },
  });
  await prismaClient.roleUser.create({
    data: { roleId: ownerRole.id, userId: ownerUser.id },
  });
  await prismaClient.roleUser.create({
    data: { roleId: accountantRole.id, userId: teamUser.id },
  });

  // ── Subscriber (plan subscription) ─────────────────────────────────────────
  const subscriber = await prismaClient.subscriber.create({
    data: {
      userId: ownerUser.id,
      planId: businessPlan.id,
      tenantId: tenant.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  await prismaClient.notification.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: ownerUser.id,
        title: "Welcome to PaySuite",
        body: "Your Acme Corp workspace is ready. Start by adding customers and products.",
        isRead: false,
        link: "/dashboard",
      },
      {
        tenantId: tenant.id,
        userId: ownerUser.id,
        title: "Invoice #INV-001 is overdue",
        body: "Invoice for Alpha LLC was due 5 days ago. Consider sending a reminder.",
        isRead: false,
        link: "/invoices",
      },
    ],
  });

  // ── User Invite (pending) ─────────────────────────────────────────────────
  await prismaClient.userInvite.create({
    data: {
      tenantId: tenant.id,
      email: "designer@acme.local",
      roleId: accountantRole.id,
      token: "invite-token-seed-001",
      status: "pending",
      invitedById: ownerUser.id,
    },
  });

  // ── Customers ──────────────────────────────────────────────────────────────
  const customerAlpha = await prismaClient.customer.create({
    data: {
      tenantId: tenant.id,
      firstName: "Alice",
      lastName: "Alpha",
      email: "alice@alpha-llc.com",
      phoneCountry: "+1",
      phoneNumber: "5551001",
      companyName: "Alpha LLC",
      address: "789 Client Blvd",
      status: "active",
      portalAccess: true,
    },
  });
  const customerBeta = await prismaClient.customer.create({
    data: {
      tenantId: tenant.id,
      firstName: "Bob",
      lastName: "Beta",
      email: "bob@beta-inc.com",
      phoneCountry: "+44",
      phoneNumber: "7700900123",
      companyName: "Beta Inc",
      taxNo: "GB123456789",
      address: "10 Downing Street",
      status: "active",
    },
  });
  const customerCharlie = await prismaClient.customer.create({
    data: {
      tenantId: tenant.id,
      firstName: "Charlie",
      lastName: "Chen",
      email: "charlie@charlie-co.com",
      companyName: "Charlie Co",
      status: "active",
    },
  });

  // ── Categories ─────────────────────────────────────────────────────────────
  const catServices = await prismaClient.category.create({
    data: { tenantId: tenant.id, name: "Services", type: "category" },
  });
  const catHardware = await prismaClient.category.create({
    data: { tenantId: tenant.id, name: "Hardware", type: "category" },
  });
  const catExpense = await prismaClient.category.create({
    data: { tenantId: tenant.id, name: "Office Supplies", type: "expense" },
  });
  const catTravel = await prismaClient.category.create({
    data: { tenantId: tenant.id, name: "Travel", type: "expense" },
  });

  // ── Units ──────────────────────────────────────────────────────────────────
  const unitHour = await prismaClient.unit.create({
    data: { tenantId: tenant.id, name: "Hour", shortName: "hr" },
  });
  const unitPiece = await prismaClient.unit.create({
    data: { tenantId: tenant.id, name: "Piece", shortName: "pc" },
  });

  // ── Products ───────────────────────────────────────────────────────────────
  const productWebDev = await prismaClient.product.create({
    data: {
      tenantId: tenant.id,
      name: "Web Development",
      price: 150,
      code: "SVC-001",
      description: "Custom web development services",
      categoryId: catServices.id,
      unitId: unitHour.id,
    },
  });
  const productConsulting = await prismaClient.product.create({
    data: {
      tenantId: tenant.id,
      name: "Consulting",
      price: 200,
      code: "SVC-002",
      description: "Technical consulting and advisory",
      categoryId: catServices.id,
      unitId: unitHour.id,
    },
  });
  const productLaptop = await prismaClient.product.create({
    data: {
      tenantId: tenant.id,
      name: "Business Laptop",
      price: 1200,
      code: "HW-001",
      description: "14-inch professional laptop",
      categoryId: catHardware.id,
      unitId: unitPiece.id,
    },
  });
  const productPrinter = await prismaClient.product.create({
    data: {
      tenantId: tenant.id,
      name: "Office Printer",
      price: 350,
      code: "HW-002",
      description: "Laser printer for office use",
      categoryId: catHardware.id,
      unitId: unitPiece.id,
    },
  });

  // ── Taxes ──────────────────────────────────────────────────────────────────
  const taxVat = await prismaClient.tax.create({
    data: { tenantId: tenant.id, name: "VAT", rate: 15 },
  });
  const taxService = await prismaClient.tax.create({
    data: { tenantId: tenant.id, name: "Service Tax", rate: 5 },
  });

  // ── Payment Methods ────────────────────────────────────────────────────────
  const pmCash = await prismaClient.paymentMethod.create({
    data: { tenantId: tenant.id, name: "Cash", type: "cash" },
  });
  const pmBank = await prismaClient.paymentMethod.create({
    data: { tenantId: tenant.id, name: "Bank Transfer", type: "bank" },
  });

  // ── Notes ──────────────────────────────────────────────────────────────────
  await prismaClient.note.createMany({
    data: [
      {
        tenantId: tenant.id,
        type: "invoice",
        name: "Standard Terms",
        note: "Payment is due within 30 days of invoice date. Late payments incur 1.5% monthly interest.",
      },
      {
        tenantId: tenant.id,
        type: "payment",
        name: "Thank You",
        note: "Thank you for your prompt payment. We appreciate your business!",
      },
    ],
  });

  // ── Invoice 1: PAID (Alpha LLC — web dev services) ─────────────────────────
  const invoice1SubTotal = 150 * 10; // 10 hours web dev = $1500
  const invoice1VatAmount = invoice1SubTotal * 0.15;
  const invoice1Total = invoice1SubTotal + invoice1VatAmount;
  const invoice1 = await prismaClient.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: customerAlpha.id,
      createdById: ownerUser.id,
      issueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 0 * 24 * 60 * 60 * 1000),
      invoiceNumber: 1,
      invoiceFullNumber: "INV-001",
      status: "paid",
      subTotal: invoice1SubTotal,
      totalAmount: invoice1Total,
      grandTotal: invoice1Total,
      receivedAmount: invoice1Total,
      note: "Web development for Q1 dashboard project.",
      portalToken: "portal-inv-001-seed",
      details: {
        create: {
          productId: productWebDev.id,
          quantity: 10,
          price: 150,
        },
      },
      taxes: {
        create: {
          taxId: taxVat.id,
          rate: 15,
          amount: invoice1VatAmount,
        },
      },
    },
  });

  // ── Invoice 2: DUE (Beta Inc — laptop + printer) ──────────────────────────
  const inv2Line1 = 1200 * 2; // 2 laptops
  const inv2Line2 = 350 * 1;  // 1 printer
  const inv2SubTotal = inv2Line1 + inv2Line2;
  const inv2VatAmount = inv2SubTotal * 0.15;
  const inv2Total = inv2SubTotal + inv2VatAmount;
  const invoice2 = await prismaClient.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: customerBeta.id,
      createdById: ownerUser.id,
      issueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      invoiceNumber: 2,
      invoiceFullNumber: "INV-002",
      status: "due",
      subTotal: inv2SubTotal,
      totalAmount: inv2Total,
      grandTotal: inv2Total,
      receivedAmount: 0,
      note: "Hardware procurement for London office.",
      portalToken: "portal-inv-002-seed",
    },
  });
  await prismaClient.invoiceDetail.createMany({
    data: [
      { invoiceId: invoice2.id, productId: productLaptop.id, quantity: 2, price: 1200 },
      { invoiceId: invoice2.id, productId: productPrinter.id, quantity: 1, price: 350 },
    ],
  });
  await prismaClient.invoiceTax.create({
    data: {
      invoiceId: invoice2.id,
      taxId: taxVat.id,
      rate: 15,
      amount: inv2VatAmount,
    },
  });

  // ── Invoice 3: PARTIALLY PAID (Charlie Co — consulting) ────────────────────
  const inv3SubTotal = 200 * 5; // 5 hours consulting = $1000
  const inv3ServiceTax = inv3SubTotal * 0.05;
  const inv3Total = inv3SubTotal + inv3ServiceTax;
  const inv3Received = 500;
  const invoice3 = await prismaClient.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: customerCharlie.id,
      createdById: ownerUser.id,
      issueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      invoiceNumber: 3,
      invoiceFullNumber: "INV-003",
      status: "partially_paid",
      subTotal: inv3SubTotal,
      totalAmount: inv3Total,
      grandTotal: inv3Total,
      receivedAmount: inv3Received,
      note: "Technical consulting — phase 1 of 2.",
      details: {
        create: {
          productId: productConsulting.id,
          quantity: 5,
          price: 200,
        },
      },
      taxes: {
        create: {
          taxId: taxService.id,
          rate: 5,
          amount: inv3ServiceTax,
        },
      },
    },
  });

  // ── Transactions (payments received) ───────────────────────────────────────
  await prismaClient.transaction.create({
    data: {
      tenantId: tenant.id,
      invoiceId: invoice1.id,
      customerId: customerAlpha.id,
      paymentMethodId: pmBank.id,
      receivedById: ownerUser.id,
      invoiceNumber: 1,
      invoiceFullNumber: "INV-001",
      receivedOn: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      amount: invoice1Total,
      note: "Full payment received via bank transfer.",
    },
  });
  await prismaClient.transaction.create({
    data: {
      tenantId: tenant.id,
      invoiceId: invoice3.id,
      customerId: customerCharlie.id,
      paymentMethodId: pmCash.id,
      receivedById: ownerUser.id,
      invoiceNumber: 3,
      invoiceFullNumber: "INV-003",
      receivedOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      amount: inv3Received,
      note: "Partial payment — cash deposit.",
    },
  });

  // ── Estimate 1: PENDING (Alpha LLC — new project proposal) ─────────────────
  const est1SubTotal = 150 * 40 + 200 * 10; // 40h dev + 10h consulting
  const est1VatAmount = est1SubTotal * 0.15;
  const est1Total = est1SubTotal + est1VatAmount;
  const estimate1 = await prismaClient.estimate.create({
    data: {
      tenantId: tenant.id,
      customerId: customerAlpha.id,
      createdById: ownerUser.id,
      date: new Date(),
      estimateNumber: 1,
      estimateFullNumber: "EST-001",
      status: "pending",
      subTotal: est1SubTotal,
      totalAmount: est1Total,
      grandTotal: est1Total,
      note: "Proposal for Q2 mobile app project.",
      portalToken: "portal-est-001-seed",
    },
  });
  await prismaClient.estimateDetail.createMany({
    data: [
      { estimateId: estimate1.id, productId: productWebDev.id, quantity: 40, price: 150 },
      { estimateId: estimate1.id, productId: productConsulting.id, quantity: 10, price: 200 },
    ],
  });
  await prismaClient.estimateTax.create({
    data: {
      estimateId: estimate1.id,
      taxId: taxVat.id,
      rate: 15,
      amount: est1VatAmount,
    },
  });

  // ── Estimate 2: APPROVED (Beta Inc — hardware bundle) ──────────────────────
  const est2SubTotal = 1200 * 5 + 350 * 3; // 5 laptops + 3 printers
  const est2VatAmount = est2SubTotal * 0.15;
  const est2Total = est2SubTotal + est2VatAmount;
  const estimate2 = await prismaClient.estimate.create({
    data: {
      tenantId: tenant.id,
      customerId: customerBeta.id,
      createdById: ownerUser.id,
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      estimateNumber: 2,
      estimateFullNumber: "EST-002",
      status: "approved",
      subTotal: est2SubTotal,
      totalAmount: est2Total,
      grandTotal: est2Total,
      note: "Office hardware refresh for Manchester branch.",
    },
  });
  await prismaClient.estimateDetail.createMany({
    data: [
      { estimateId: estimate2.id, productId: productLaptop.id, quantity: 5, price: 1200 },
      { estimateId: estimate2.id, productId: productPrinter.id, quantity: 3, price: 350 },
    ],
  });
  await prismaClient.estimateTax.create({
    data: {
      estimateId: estimate2.id,
      taxId: taxVat.id,
      rate: 15,
      amount: est2VatAmount,
    },
  });

  // ── Expenses ───────────────────────────────────────────────────────────────
  await prismaClient.expense.create({
    data: {
      tenantId: tenant.id,
      title: "Office Stationery",
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      reference: "EXP-001",
      amount: 85.50,
      categoryId: catExpense.id,
      note: "Paper, pens, and printer cartridges for the month.",
    },
  });
  await prismaClient.expense.create({
    data: {
      tenantId: tenant.id,
      title: "Client Visit — London",
      date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      reference: "EXP-002",
      amount: 320,
      categoryId: catTravel.id,
      note: "Train + hotel for Beta Inc site visit.",
    },
  });

  // ── Tickets + Comments ─────────────────────────────────────────────────────
  const deptBilling = departments.find((d) => d.name === "Billing") ?? departments[0];
  const deptTechnical = departments.find((d) => d.name === "Technical") ?? departments[0];
  const priorityHigh = priorities.find((p) => p.name === "High") ?? priorities[0];
  const priorityMedium = priorities.find((p) => p.name === "Medium") ?? priorities[0];

  const ticket1 = await prismaClient.ticket.create({
    data: {
      tenantId: tenant.id,
      subject: "Invoice PDF not downloading",
      departmentId: deptTechnical.id,
      priorityId: priorityHigh.id,
      createdById: ownerUser.id,
      assignedToId: teamUser.id,
      status: "pending",
      body: "When I click 'Download PDF' on INV-002, nothing happens. Browser shows a console error.",
    },
  });
  await prismaClient.ticketComment.createMany({
    data: [
      {
        ticketId: ticket1.id,
        userId: teamUser.id,
        comment: "I've reproduced the issue. Investigating the PDF generation service.",
        userType: "tenant",
      },
      {
        ticketId: ticket1.id,
        userId: ownerUser.id,
        comment: "Thanks Ben — it's urgent since the client needs the invoice today.",
        userType: "tenant",
      },
    ],
  });

  const ticket2 = await prismaClient.ticket.create({
    data: {
      tenantId: tenant.id,
      subject: "How to set up recurring invoices?",
      departmentId: deptBilling.id,
      priorityId: priorityMedium.id,
      createdById: ownerUser.id,
      status: "solved",
      rating: 5,
      body: "I'd like to send monthly retainer invoices automatically. How do I configure recurring billing?",
    },
  });
  await prismaClient.ticketComment.create({
    data: {
      ticketId: ticket2.id,
      userId: adminUser.id,
      comment: "You can enable recurring invoices from the invoice creation form — toggle the 'Recurring' switch and set the interval to 'monthly'. The system will auto-generate invoices on schedule.",
      userType: "app",
    },
  });

  // ── Customizations ─────────────────────────────────────────────────────────
  await prismaClient.customization.createMany({
    data: [
      {
        tenantId: tenant.id,
        key: "invoice",
        value: JSON.stringify({
          prefix: "INV-",
          startNumber: 1,
          logo: null,
          footerNote: "Thank you for your business!",
          template: 1,
        }),
      },
      {
        tenantId: tenant.id,
        key: "estimate",
        value: JSON.stringify({
          prefix: "EST-",
          startNumber: 1,
          logo: null,
          footerNote: "This estimate is valid for 30 days.",
          template: 1,
        }),
      },
    ],
  });

  // ── Billing History ────────────────────────────────────────────────────────
  await prismaClient.billingHistory.create({
    data: {
      invoiceNumber: "BIL-001",
      paidById: ownerUser.id,
      subscriberId: subscriber.id,
      planId: businessPlan.id,
      tenantId: tenant.id,
      paymentMethodId: pmBank.id,
      status: "paid",
      amount: 29,
      transactionId: "seed-billing-txn-001",
    },
  });

  // ── CMS: FAQs ─────────────────────────────────────────────────────────────
  await prismaClient.cmsFaq.createMany({
    data: [
      {
        question: "What payment methods does PaySuite support?",
        answer: "PaySuite supports cash, bank transfer, Stripe, PayPal, and Razorpay out of the box.",
        sortOrder: 1,
        isPublished: true,
      },
      {
        question: "Can I use PaySuite for multiple companies?",
        answer: "Yes! PaySuite is multi-tenant — each company gets its own isolated workspace with separate customers, invoices, and settings.",
        sortOrder: 2,
        isPublished: true,
      },
      {
        question: "Is there a free plan available?",
        answer: "Absolutely. The Free plan includes up to 20 customers, 50 invoices, and 50 estimates. Upgrade anytime for higher limits.",
        sortOrder: 3,
        isPublished: true,
      },
    ],
  });

  // ── CMS: Testimonials ──────────────────────────────────────────────────────
  await prismaClient.cmsTestimonial.createMany({
    data: [
      {
        name: "Sarah Kim",
        role: "Freelance Designer",
        quote: "PaySuite cut my invoicing time in half. The customer portal is a game-changer for getting paid faster.",
        sortOrder: 1,
        isPublished: true,
      },
      {
        name: "Marcus Wright",
        role: "CEO, Digital Agency",
        quote: "We switched from spreadsheets to PaySuite and haven't looked back. Multi-tenant support is exactly what we needed for our clients.",
        sortOrder: 2,
        isPublished: true,
      },
    ],
  });

  // ── CMS: Site Content ──────────────────────────────────────────────────────
  await prismaClient.cmsSiteContent.createMany({
    data: [
      { key: "hero_title", value: "Invoicing made simple for growing businesses" },
      { key: "hero_subtitle", value: "Create professional invoices, track expenses, and get paid faster — all in one place." },
      { key: "contact_email", value: "support@paysuite.app" },
      { key: "terms", value: "Standard terms of service for PaySuite platform users." },
      { key: "privacy", value: "We respect your privacy. PaySuite does not sell or share your business data with third parties." },
    ],
  });

  // ── Newsletter Subscriber ──────────────────────────────────────────────────
  await prismaClient.newsletter.create({
    data: { email: "early-adopter@example.com" },
  });

  // ── Feature + FeaturePlan ──────────────────────────────────────────────────
  const features = await Promise.all([
    prismaClient.feature.create({
      data: { name: "recurring_invoices", label: "Recurring Invoices", groupName: "invoicing" },
    }),
    prismaClient.feature.create({
      data: { name: "customer_portal", label: "Customer Portal", groupName: "invoicing" },
    }),
    prismaClient.feature.create({
      data: { name: "expense_tracking", label: "Expense Tracking", groupName: "finance" },
    }),
  ]);
  // Business plan gets all features
  await prismaClient.featurePlan.createMany({
    data: features.map((f) => ({
      featureId: f.id,
      planId: businessPlan.id,
    })),
  });
  // Free plan gets only expense tracking
  await prismaClient.featurePlan.create({
    data: {
      featureId: features[2].id,
      planId: freePlan.id,
    },
  });

  console.log("[seedTestData] ✅ PaySuite business-domain test data seeded successfully.");
  console.log("  Admin user: admin@paysuite.local");
  console.log("  Tenant: Acme Corp (owner@acme.local)");
  console.log("  Team member: accountant@acme.local");
  console.log("  Customers: 3 (Alpha LLC, Beta Inc, Charlie Co)");
  console.log("  Products: 4 | Taxes: 2 | Payment Methods: 2");
  console.log("  Invoices: 3 (paid, due, partially_paid)");
  console.log("  Estimates: 2 (pending, approved)");
  console.log("  Expenses: 2 | Transactions: 2");
  console.log("  Tickets: 2 (pending, solved) with comments");
  console.log("  CMS: 3 FAQs, 2 testimonials, 5 site content entries");
  console.log("  Note: Users are DB shells — create real auth via /signup");
}
