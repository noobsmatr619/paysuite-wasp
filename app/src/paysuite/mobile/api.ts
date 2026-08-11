import { HttpError } from "wasp/server";
import type { MobileApi } from "wasp/server/api";
import type { PrismaClient } from "@prisma/client";
import { resolveBearerToken, signMobileToken } from "./jwt";
import { buildDocumentHtml, customerDisplay } from "../documents/pdfHtml";
import { buildPdfBytes, toBase64 } from "../documents/realPdf";
import {
  computeLineTotals,
  formatDocNumber,
  dueAmount,
} from "../shared/tenant";
import { assertWithinPlanLimit } from "../shared/planLimits";

async function resolveUser(
  req: { headers: Record<string, any> },
  entities: { User: PrismaClient["user"] },
) {
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (!auth || typeof auth !== "string") {
    throw new HttpError(401, "Missing Authorization header");
  }
  try {
    const { userId } = resolveBearerToken(auth);
    const user = await entities.User.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(401, "Invalid token user");
    return user;
  } catch (e: any) {
    throw new HttpError(401, e?.message || "Invalid token");
  }
}

async function tenantIdFor(
  user: {
    id: string;
    tenantId: string | null;
    username: string | null;
    email: string | null;
    companyName: string | null;
  },
  entities: { User: PrismaClient["user"]; Tenant: PrismaClient["tenant"] },
) {
  if (user.tenantId) return user.tenantId;
  const slugBase =
    (user.username || user.email || "company")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) || "company";
  const tenant = await entities.Tenant.create({
    data: {
      slug: `${slugBase}-${user.id.slice(0, 8)}`,
      name: user.companyName || user.username || "My Company",
    },
  });
  await entities.User.update({
    where: { id: user.id },
    data: { tenantId: tenant.id, isSubscriber: true },
  });
  return tenant.id;
}

function normalizePath(req: { path?: string; params?: Record<string, any>; url?: string }) {
  // Prefer named wildcard param from /api/mobile/*path
  const fromParam = req.params?.path;
  if (typeof fromParam === "string" && fromParam.length) {
    return fromParam.replace(/^\//, "");
  }
  if (Array.isArray(fromParam) && fromParam.length) {
    return fromParam.join("/");
  }
  return (req.path || req.url || "")
    .split("?")[0]
    .replace(/^\/api\/mobile\/?/, "")
    .replace(/^\/mobile\/?/, "")
    .replace(/^\//, "");
}

export const mobileApi: MobileApi = async (req, res, context) => {
  try {
    const path = normalizePath(req as any);
    const method = (req.method || "GET").toUpperCase();
    const body = req.body || {};

    if (method === "POST" && (path === "auth/login" || path === "login")) {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email) throw new HttpError(400, "Email is required");
      const user = await context.entities.User.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) throw new HttpError(401, "Invalid credentials");

      const shared =
        process.env.MOBILE_SHARED_PASSWORD ||
        (context as any).env?.MOBILE_SHARED_PASSWORD;
      const isProd = process.env.NODE_ENV === "production";
      let ok = false;
      if (password && password === user.id) ok = true;
      else if (shared && password === shared) ok = true;
      else if (!isProd && password.length >= 4) ok = true;
      // Prefer shared password in all envs when set
      if (shared) ok = password === shared || password === user.id;
      if (!ok) throw new HttpError(401, "Invalid credentials");

      const token = signMobileToken(user.id, user.email);
      return res.json({
        token,
        tokenType: "Bearer",
        expiresInDays: 7,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          companyName: user.companyName,
          phoneNumber: user.phoneNumber,
          address: user.address,
          taxNo: user.taxNo,
          tenantId: user.tenantId,
        },
      });
    }

    const user = await resolveUser(req as any, context.entities);
    const tenantId = await tenantIdFor(user as any, context.entities);
    const E = context.entities;

    if (method === "POST" && path === "auth/refresh") {
      return res.json({
        token: signMobileToken(user.id, user.email),
        tokenType: "Bearer",
        expiresInDays: 7,
      });
    }

    if (method === "GET" && (path === "statistics" || path === "")) {
      const [customers, invoices, products, expenses] = await Promise.all([
        E.Customer.count({ where: { tenantId } }),
        E.Invoice.findMany({
          where: { tenantId },
          select: { grandTotal: true, receivedAmount: true },
        }),
        E.Product.count({ where: { tenantId } }),
        E.Expense.findMany({ where: { tenantId }, select: { amount: true } }),
      ]);
      const totalRevenue = invoices.reduce((s, i) => s + i.grandTotal, 0);
      const totalPaid = invoices.reduce((s, i) => s + i.receivedAmount, 0);
      return res.json({
        customerCount: customers,
        productCount: products,
        invoiceCount: invoices.length,
        totalRevenue,
        totalPaid,
        totalDue: Math.max(0, totalRevenue - totalPaid),
        totalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      });
    }

    // Customers
    if (path === "customers" && method === "GET") {
      return res.json(
        await E.Customer.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path === "customers" && method === "POST") {
      await assertWithinPlanLimit(E as any, tenantId, "customers");
      return res.status(201).json(
        await E.Customer.create({
          data: {
            tenantId,
            firstName: body.firstName || "Customer",
            lastName: body.lastName || null,
            email: body.email || null,
            phoneNumber: body.phoneNumber || null,
            companyName: body.companyName || null,
            address: body.address || null,
            taxNo: body.taxNo || null,
            status: body.status || "active",
          },
        }),
      );
    }
    if (path.startsWith("customers/") && method === "GET") {
      const id = path.split("/")[1];
      const row = await E.Customer.findFirst({ where: { id, tenantId } });
      if (!row) throw new HttpError(404);
      return res.json(row);
    }
    if (path.startsWith("customers/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Customer.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Customer.update({
          where: { id },
          data: {
            firstName: body.firstName ?? existing.firstName,
            lastName: body.lastName ?? existing.lastName,
            email: body.email ?? existing.email,
            phoneNumber: body.phoneNumber ?? existing.phoneNumber,
            companyName: body.companyName ?? existing.companyName,
            address: body.address ?? existing.address,
            taxNo: body.taxNo ?? existing.taxNo,
            status: body.status ?? existing.status,
          },
        }),
      );
    }
    if (path.startsWith("customers/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Customer.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Customer.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Products
    if (path === "products" && method === "GET") {
      return res.json(
        await E.Product.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path === "products" && method === "POST") {
      await assertWithinPlanLimit(E as any, tenantId, "products");
      return res.status(201).json(
        await E.Product.create({
          data: {
            tenantId,
            name: body.name || "Product",
            price: Number(body.price) || 0,
            code: body.code || null,
            description: body.description || null,
          },
        }),
      );
    }
    if (path.startsWith("products/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Product.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Product.update({
          where: { id },
          data: {
            name: body.name ?? existing.name,
            price: body.price != null ? Number(body.price) : existing.price,
            code: body.code ?? existing.code,
            description: body.description ?? existing.description,
          },
        }),
      );
    }
    if (path.startsWith("products/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Product.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Product.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Invoices
    if (path === "invoices" && method === "GET") {
      const rows = await E.Invoice.findMany({
        where: { tenantId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json(
        rows.map((i) => ({ ...i, dueAmount: dueAmount(i) })),
      );
    }
    if (path === "invoices" && method === "POST") {
      await assertWithinPlanLimit(E as any, tenantId, "invoices");
      const lines = body.lines || [];
      if (!body.customerId || !lines.length) {
        throw new HttpError(400, "customerId and lines required");
      }
      const taxRateTotal = (body.taxes || []).reduce(
        (s: number, t: any) => s + Number(t.rate || 0),
        0,
      );
      const totals = computeLineTotals(
        lines,
        body.discountType || "none",
        body.discountAmount,
        taxRateTotal,
      );
      const last = await E.Invoice.findFirst({
        where: { tenantId },
        orderBy: { invoiceNumber: "desc" },
      });
      const invoiceNumber = (last?.invoiceNumber || 0) + 1;
      const inv = await E.Invoice.create({
        data: {
          tenantId,
          customerId: body.customerId,
          createdById: user.id,
          issueDate: new Date(body.issueDate || Date.now()),
          dueDate: new Date(body.dueDate || Date.now() + 14 * 86400000),
          invoiceNumber,
          invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
          status: "due",
          subTotal: totals.subTotal,
          discountType: body.discountType || "none",
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount,
          grandTotal: totals.grandTotal,
          receivedAmount: 0,
          note: body.note || null,
          invoiceTemplate: 1,
          details: {
            create: lines.map((l: any) => ({
              productId: l.productId,
              quantity: Number(l.quantity),
              price: Number(l.price),
            })),
          },
        },
        include: { customer: true, details: true },
      });
      return res.status(201).json({ ...inv, dueAmount: dueAmount(inv) });
    }
    if (path.match(/^invoices\/[^/]+$/) && method === "GET") {
      const id = path.split("/")[1];
      const inv = await E.Invoice.findFirst({
        where: { id, tenantId },
        include: {
          customer: true,
          details: { include: { product: true } },
          taxes: true,
          transactions: true,
        },
      });
      if (!inv) throw new HttpError(404);
      return res.json({ ...inv, dueAmount: dueAmount(inv) });
    }
    if (path.match(/^invoices\/[^/]+\/pay$/) && method === "POST") {
      const id = path.split("/")[1];
      const inv = await E.Invoice.findFirst({ where: { id, tenantId } });
      if (!inv) throw new HttpError(404);
      const amount = Number(body.amount);
      if (!(amount > 0)) throw new HttpError(400, "Invalid amount");
      const due = dueAmount(inv);
      if (amount > due + 0.001) throw new HttpError(400, "Exceeds due");
      const lastTx = await E.Transaction.findFirst({
        where: { tenantId },
        orderBy: { invoiceNumber: "desc" },
      });
      const txNum = (lastTx?.invoiceNumber || 0) + 1;
      await E.Transaction.create({
        data: {
          tenantId,
          invoiceId: inv.id,
          customerId: inv.customerId,
          receivedById: user.id,
          invoiceNumber: txNum,
          invoiceFullNumber: formatDocNumber("PAY", txNum),
          amount,
          note: body.note || "Mobile payment",
          receivedOn: new Date(),
        },
      });
      const receivedAmount = inv.receivedAmount + amount;
      const status =
        receivedAmount >= inv.grandTotal
          ? "paid"
          : receivedAmount > 0
            ? "partially_paid"
            : "due";
      const updated = await E.Invoice.update({
        where: { id },
        data: { receivedAmount, status },
      });
      return res.json({ ...updated, dueAmount: dueAmount(updated) });
    }
    if (path.match(/^invoices\/[^/]+\/document$/) && method === "GET") {
      const id = path.split("/")[1];
      const invoice = await E.Invoice.findFirst({
        where: { id, tenantId },
        include: {
          customer: true,
          details: { include: { product: true } },
          taxes: { include: { tax: true } },
          tenant: true,
        },
      });
      if (!invoice) throw new HttpError(404);
      const html = buildDocumentHtml({
        fullNumber: invoice.invoiceFullNumber,
        dateLabel: `Issued ${invoice.issueDate.toLocaleDateString()}`,
        status: invoice.status,
        subTotal: invoice.subTotal,
        discountAmount: invoice.discountAmount,
        grandTotal: invoice.grandTotal,
        note: invoice.note,
        companyName: invoice.tenant.name,
        customerName: customerDisplay(invoice.customer),
        customerEmail: invoice.customer.email,
        customerAddress: invoice.customer.address,
        lines: invoice.details.map((d) => ({
          name: d.product.name,
          quantity: d.quantity,
          price: d.price,
        })),
        taxes: invoice.taxes.map((t) => ({
          name: t.tax?.name || "Tax",
          rate: t.rate,
          amount: t.amount,
        })),
      });
      const taxAmount = invoice.taxes.reduce((s, t) => s + t.amount, 0);
      const bytes = await buildPdfBytes({
        title: "INVOICE",
        fullNumber: invoice.invoiceFullNumber,
        companyName: invoice.tenant.name,
        customerName: customerDisplay(invoice.customer),
        customerEmail: invoice.customer.email,
        customerAddress: invoice.customer.address,
        dateLabel: invoice.issueDate.toLocaleDateString(),
        status: invoice.status,
        subTotal: invoice.subTotal,
        discountAmount: invoice.discountAmount || 0,
        taxAmount,
        grandTotal: invoice.grandTotal,
        note: invoice.note,
        lines: invoice.details.map((d) => ({
          name: d.product.name,
          quantity: d.quantity,
          price: d.price,
        })),
      });
      return res.json({
        html,
        fullNumber: invoice.invoiceFullNumber,
        pdfBase64: toBase64(bytes),
        filename: `${invoice.invoiceFullNumber}.pdf`,
      });
    }
    if (path.startsWith("invoices/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Invoice.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Invoice.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Estimates
    if (path === "estimates" && method === "GET") {
      return res.json(
        await E.Estimate.findMany({
          where: { tenantId },
          include: { customer: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path === "estimates" && method === "POST") {
      await assertWithinPlanLimit(E as any, tenantId, "estimates");
      const lines = body.lines || [];
      if (!body.customerId || !lines.length) {
        throw new HttpError(400, "customerId and lines required");
      }
      const totals = computeLineTotals(
        lines,
        body.discountType || "none",
        body.discountAmount,
        0,
      );
      const last = await E.Estimate.findFirst({
        where: { tenantId },
        orderBy: { estimateNumber: "desc" },
      });
      const estimateNumber = (last?.estimateNumber || 0) + 1;
      return res.status(201).json(
        await E.Estimate.create({
          data: {
            tenantId,
            customerId: body.customerId,
            createdById: user.id,
            date: new Date(body.date || Date.now()),
            estimateNumber,
            estimateFullNumber: formatDocNumber("EST", estimateNumber),
            status: "pending",
            subTotal: totals.subTotal,
            discountType: body.discountType || "none",
            discountAmount: totals.discountAmount,
            totalAmount: totals.totalAmount,
            grandTotal: totals.grandTotal,
            note: body.note || null,
            estimateTemplate: 1,
            details: {
              create: lines.map((l: any) => ({
                productId: l.productId,
                quantity: Number(l.quantity),
                price: Number(l.price),
              })),
            },
          },
          include: { customer: true },
        }),
      );
    }
    if (path.match(/^estimates\/[^/]+\/convert$/) && method === "POST") {
      const id = path.split("/")[1];
      const estimate = await E.Estimate.findFirst({
        where: { id, tenantId },
        include: { details: true, taxes: true },
      });
      if (!estimate) throw new HttpError(404);
      await assertWithinPlanLimit(E as any, tenantId, "invoices");
      const last = await E.Invoice.findFirst({
        where: { tenantId },
        orderBy: { invoiceNumber: "desc" },
      });
      const invoiceNumber = (last?.invoiceNumber || 0) + 1;
      const inv = await E.Invoice.create({
        data: {
          tenantId,
          customerId: estimate.customerId,
          createdById: user.id,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 14 * 86400000),
          invoiceNumber,
          invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
          status: "due",
          subTotal: estimate.subTotal,
          discountType: estimate.discountType,
          discountAmount: estimate.discountAmount,
          totalAmount: estimate.totalAmount,
          grandTotal: estimate.grandTotal,
          receivedAmount: 0,
          note: estimate.note,
          invoiceTemplate: estimate.estimateTemplate,
          details: {
            create: estimate.details.map((d) => ({
              productId: d.productId,
              quantity: d.quantity,
              price: d.price,
            })),
          },
        },
      });
      await E.Estimate.update({
        where: { id },
        data: { status: "approved" },
      });
      return res.json(inv);
    }

    // Expenses
    if (path === "expenses" && method === "GET") {
      return res.json(
        await E.Expense.findMany({
          where: { tenantId },
          include: { category: true },
          orderBy: { date: "desc" },
        }),
      );
    }
    if (path === "expenses" && method === "POST") {
      let categoryId = body.categoryId;
      if (!categoryId) {
        let cat = await E.Category.findFirst({
          where: { tenantId, type: "expense" },
        });
        if (!cat) {
          cat = await E.Category.create({
            data: { tenantId, name: "General", type: "expense" },
          });
        }
        categoryId = cat.id;
      }
      return res.status(201).json(
        await E.Expense.create({
          data: {
            tenantId,
            title: body.title || "Expense",
            date: new Date(body.date || Date.now()),
            amount: Number(body.amount) || 0,
            categoryId,
            reference: body.reference || null,
            note: body.note || null,
          },
        }),
      );
    }
    if (path.startsWith("expenses/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Expense.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Expense.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Tickets
    if (path === "tickets" && method === "GET") {
      return res.json(
        await E.Ticket.findMany({
          where: { tenantId },
          include: { department: true, priority: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path === "tickets" && method === "POST") {
      let departmentId = body.departmentId;
      let priorityId = body.priorityId;
      if (!departmentId) {
        let d = await E.Department.findFirst();
        if (!d) d = await E.Department.create({ data: { name: "General" } });
        departmentId = d.id;
      }
      if (!priorityId) {
        let p = await E.Priority.findFirst();
        if (!p) p = await E.Priority.create({ data: { name: "Medium" } });
        priorityId = p.id;
      }
      return res.status(201).json(
        await E.Ticket.create({
          data: {
            tenantId,
            subject: body.subject || "Support",
            departmentId,
            priorityId,
            createdById: user.id,
            body: body.body || null,
            status: "pending",
          },
        }),
      );
    }
    if (path.match(/^tickets\/[^/]+$/) && method === "GET") {
      const id = path.split("/")[1];
      const t = await E.Ticket.findFirst({
        where: { id, tenantId },
        include: {
          comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
          department: true,
          priority: true,
        },
      });
      if (!t) throw new HttpError(404);
      return res.json(t);
    }
    if (path.match(/^tickets\/[^/]+\/comments$/) && method === "POST") {
      const id = path.split("/")[1];
      const t = await E.Ticket.findFirst({ where: { id, tenantId } });
      if (!t) throw new HttpError(404);
      return res.status(201).json(
        await E.TicketComment.create({
          data: {
            ticketId: id,
            userId: user.id,
            comment: body.comment || "",
            userType: "tenant",
          },
        }),
      );
    }

    if (path === "transactions" && method === "GET") {
      return res.json(
        await E.Transaction.findMany({
          where: { tenantId },
          include: { customer: true, paymentMethod: true },
          orderBy: { receivedOn: "desc" },
        }),
      );
    }

    if (path === "my-profile" && method === "GET") {
      return res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
        phoneNumber: user.phoneNumber,
        address: user.address,
        taxNo: user.taxNo,
        tenantId,
      });
    }
    if (path === "my-profile" && method === "PUT") {
      const updated = await E.User.update({
        where: { id: user.id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          companyName: body.companyName,
          phoneNumber: body.phoneNumber,
          address: body.address,
          taxNo: body.taxNo,
        },
      });
      return res.json(updated);
    }

    if (path === "my-plan" && method === "GET") {
      const subscriber = await E.Subscriber.findFirst({
        where: { tenantId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ subscriber });
    }

    if (path === "plans" && method === "GET") {
      return res.json(
        await E.Plan.findMany({
          where: { status: "active" },
          orderBy: { price: "asc" },
        }),
      );
    }

    if (path === "taxes" && method === "GET") {
      return res.json(await E.Tax.findMany({ where: { tenantId } }));
    }

    throw new HttpError(404, `Unknown mobile route: ${method} ${path}`);
  } catch (err: any) {
    const status = err?.statusCode || 500;
    return res.status(status).json({
      message: err?.message || "Mobile API error",
    });
  }
};
