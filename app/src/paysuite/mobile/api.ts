import { HttpError } from "wasp/server";
import type { MobileApi } from "wasp/server/api";
import type { PrismaClient } from "@prisma/client";
import {
  createProviderId,
  createUser,
  findAuthIdentity,
  getProviderDataWithPassword,
  sanitizeAndSerializeProviderData,
  updateAuthIdentityProviderData,
} from "wasp/auth/utils";
import { resolveBearerToken, signMobileToken } from "./jwt";
import { verifyEmailPassword } from "./verifyCredentials";
import { buildDocumentHtml, customerDisplay } from "../documents/pdfHtml";
import { buildPdfBytes, toBase64 } from "../documents/realPdf";
import crypto from "crypto";
import {
  computeLineTotals,
  formatDocNumber,
  dueAmount,
} from "../shared/tenant";
import { assertWithinPlanLimit } from "../shared/planLimits";
import { PERMISSIONS } from "../shared/permissions";

async function resolveUser(
  req: { headers: Record<string, any> },
  entities: { User: PrismaClient["user"] },
) {
  // Prefer X-PaySuite-Token — Wasp/Lucia session middleware may consume Authorization.
  const headers = req.headers || {};
  const raw =
    headers["x-paysuite-token"] ||
    headers["X-PaySuite-Token"] ||
    headers["authorization"] ||
    headers["Authorization"];
  if (!raw || typeof raw !== "string") {
    throw new HttpError(401, "Missing X-PaySuite-Token (or Authorization) header");
  }
  try {
    const { userId } = resolveBearerToken(
      raw.startsWith("Bearer ") ? raw : `Bearer ${raw}`,
    );
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

    // ─── Public auth (no token) ─────────────────────────────────────────────
    if (method === "POST" && (path === "auth/login" || path === "login")) {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) {
        throw new HttpError(400, "Email and password are required");
      }

      // 1) Real Wasp email/password hash verification
      let user = await verifyEmailPassword(email, password);

      // 2) Optional shared password ONLY when MOBILE_SHARED_PASSWORD is set
      //    (ops escape hatch; prefer real passwords)
      if (!user) {
        const shared = process.env.MOBILE_SHARED_PASSWORD;
        if (shared && password === shared) {
          user = await context.entities.User.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
          });
        }
      }

      // 3) Dev-only: accept Settings-issued raw token as password IF it is the user id
      //    (legacy; disabled when NODE_ENV=production)
      if (!user && process.env.NODE_ENV !== "production") {
        const byId = await context.entities.User.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
        if (byId && password === byId.id) user = byId;
      }

      if (!user) throw new HttpError(401, "Invalid credentials");

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

    if (method === "POST" && path === "auth/register") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const firstName = String(body.firstName || body.name || "").trim() || null;
      const lastName = String(body.lastName || "").trim() || null;
      const companyName =
        String(body.companyName || body.company || "").trim() || null;
      if (!email || !password) {
        throw new HttpError(400, "Email and password are required");
      }
      if (password.length < 6) {
        throw new HttpError(400, "Password must be at least 6 characters");
      }
      const providerId = createProviderId("email", email);
      const existing = await findAuthIdentity(providerId);
      if (existing) throw new HttpError(422, "User already exists");

      const providerData = await sanitizeAndSerializeProviderData<"email">({
        hashedPassword: password,
        isEmailVerified: true,
        emailVerificationSentAt: null,
        passwordResetSentAt: null,
      });
      const created = await createUser(providerId, providerData, {
        email,
        username: email,
        firstName,
        lastName,
        companyName,
        isSubscriber: true,
      } as any);
      // Auto-tenant
      const tid = await tenantIdFor(created as any, context.entities);
      const token = signMobileToken(created.id, created.email);
      return res.status(201).json({
        token,
        tokenType: "Bearer",
        expiresInDays: 7,
        user: {
          id: created.id,
          email: created.email,
          firstName: created.firstName,
          lastName: created.lastName,
          companyName: created.companyName,
          tenantId: tid,
        },
      });
    }

    // Forgot password → OTP stub (stores token in Customization key for demo)
    if (
      method === "POST" &&
      (path === "auth/forgot-password" || path === "auth/generate-otp")
    ) {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) throw new HttpError(400, "Email required");
      const user = await context.entities.User.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      // Always 200 to avoid email enumeration
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      if (user) {
        const tid = await tenantIdFor(user as any, context.entities);
        await context.entities.Customization.upsert({
          where: {
            tenantId_key: {
              tenantId: tid,
              key: `otp:${email}`,
            },
          },
          create: {
            tenantId: tid,
            key: `otp:${email}`,
            value: JSON.stringify({
              otp,
              expiresAt: Date.now() + 15 * 60 * 1000,
            }),
          },
          update: {
            value: JSON.stringify({
              otp,
              expiresAt: Date.now() + 15 * 60 * 1000,
            }),
          },
        });
      }
      return res.json({
        ok: true,
        message: "If the account exists, an OTP was sent",
        // Dev convenience (never in production responses for real SMS)
        ...(process.env.NODE_ENV !== "production" && user ? { debugOtp: otp } : {}),
      });
    }

    if (method === "POST" && path === "auth/verify-otp") {
      const email = String(body.email || "").trim().toLowerCase();
      const otp = String(body.otp || body.code || "").trim();
      if (!email || !otp) throw new HttpError(400, "Email and OTP required");
      const user = await context.entities.User.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) throw new HttpError(400, "Invalid OTP");
      const keyTenant = await tenantIdFor(user as any, context.entities);
      const row = await context.entities.Customization.findUnique({
        where: { tenantId_key: { tenantId: keyTenant, key: `otp:${email}` } },
      });
      if (!row) throw new HttpError(400, "Invalid or expired OTP");
      const data = JSON.parse(row.value);
      if (data.otp !== otp || data.expiresAt < Date.now()) {
        throw new HttpError(400, "Invalid or expired OTP");
      }
      const resetToken = crypto.randomBytes(24).toString("hex");
      await context.entities.Customization.update({
        where: { tenantId_key: { tenantId: keyTenant, key: `otp:${email}` } },
        data: {
          value: JSON.stringify({
            ...data,
            resetToken,
            verified: true,
          }),
        },
      });
      return res.json({ ok: true, token: resetToken, email });
    }

    if (
      method === "POST" &&
      (path === "auth/confirm-password" || path === "auth/reset-password")
    ) {
      const email = String(body.email || "").trim().toLowerCase();
      const token = String(body.token || "").trim();
      const password = String(body.password || body.newPassword || "");
      if (!email || !token || !password) {
        throw new HttpError(400, "Email, token and password required");
      }
      if (password.length < 6) throw new HttpError(400, "Password too short");
      const user = await context.entities.User.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) throw new HttpError(400, "Invalid token");
      const keyTenant = await tenantIdFor(user as any, context.entities);
      const row = await context.entities.Customization.findUnique({
        where: { tenantId_key: { tenantId: keyTenant, key: `otp:${email}` } },
      });
      if (!row) throw new HttpError(400, "Invalid token");
      const data = JSON.parse(row.value);
      if (!data.verified || data.resetToken !== token) {
        throw new HttpError(400, "Invalid token");
      }
      const providerId = createProviderId("email", email);
      const identity = await findAuthIdentity(providerId);
      if (!identity) throw new HttpError(400, "No password identity");
      const existing = getProviderDataWithPassword<"email">(identity.providerData);
      await updateAuthIdentityProviderData<"email">(providerId, existing, {
        hashedPassword: password,
      });
      await context.entities.Customization.delete({
        where: { tenantId_key: { tenantId: keyTenant, key: `otp:${email}` } },
      });
      return res.json({ ok: true, message: "Password updated" });
    }

    // Social login stub (Flutter has this; map to email identity if provided)
    if (method === "POST" && path === "auth/social") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) throw new HttpError(400, "Email required from social provider");
      let user = await context.entities.User.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) {
        const providerId = createProviderId("email", email);
        const providerData = await sanitizeAndSerializeProviderData<"email">({
          hashedPassword: crypto.randomBytes(16).toString("hex"),
          isEmailVerified: true,
          emailVerificationSentAt: null,
          passwordResetSentAt: null,
        });
        user = await createUser(providerId, providerData, {
          email,
          username: email,
          firstName: body.firstName || body.name || null,
          lastName: body.lastName || null,
          isSubscriber: true,
        } as any);
      }
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
          tenantId: user.tenantId,
        },
      });
    }

    const user = await resolveUser(req as any, context.entities);
    const tenantId = await tenantIdFor(user as any, context.entities);
    const E = context.entities;
    const q = (req.query || {}) as Record<string, any>;

    if (method === "POST" && path === "auth/refresh") {
      return res.json({
        token: signMobileToken(user.id, user.email),
        tokenType: "Bearer",
        expiresInDays: 7,
      });
    }

    if (method === "POST" && path === "change-password") {
      const current = String(body.currentPassword || body.oldPassword || "");
      const next = String(body.password || body.newPassword || "");
      if (!current || !next) throw new HttpError(400, "Passwords required");
      if (next.length < 6) throw new HttpError(400, "Password too short");
      const email = (user.email || "").toLowerCase();
      const ok = await verifyEmailPassword(email, current);
      if (!ok) throw new HttpError(401, "Current password incorrect");
      const providerId = createProviderId("email", email);
      const identity = await findAuthIdentity(providerId);
      if (!identity) throw new HttpError(400, "No password identity");
      const existing = getProviderDataWithPassword<"email">(identity.providerData);
      await updateAuthIdentityProviderData<"email">(providerId, existing, {
        hashedPassword: next,
      });
      return res.json({ ok: true });
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

    // Customers (filters: status, search)
    if (path === "customers" && method === "GET") {
      const where: any = { tenantId };
      if (q.status) where.status = String(q.status);
      if (q.search || q.q) {
        const s = String(q.search || q.q);
        where.OR = [
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { email: { contains: s, mode: "insensitive" } },
          { companyName: { contains: s, mode: "insensitive" } },
        ];
      }
      return res.json(
        await E.Customer.findMany({
          where,
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

    // Invoices (filters: status, customerId, search)
    if (path === "invoices" && method === "GET") {
      const where: any = { tenantId };
      if (q.status) where.status = String(q.status);
      if (q.customerId) where.customerId = String(q.customerId);
      if (q.search || q.q) {
        const s = String(q.search || q.q);
        where.OR = [
          { invoiceFullNumber: { contains: s, mode: "insensitive" } },
          { note: { contains: s, mode: "insensitive" } },
        ];
      }
      const rows = await E.Invoice.findMany({
        where,
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
          portalToken: crypto.randomBytes(24).toString("hex"),
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
    if (path.match(/^invoices\/[^/]+$/) && method === "PUT") {
      const id = path.split("/")[1];
      const inv = await E.Invoice.findFirst({
        where: { id, tenantId },
        include: { details: true },
      });
      if (!inv) throw new HttpError(404);
      const data: any = {};
      if (body.note !== undefined) data.note = body.note;
      if (body.status) data.status = body.status;
      if (body.dueDate) data.dueDate = new Date(body.dueDate);
      if (body.issueDate) data.issueDate = new Date(body.issueDate);
      if (body.recurring !== undefined) data.recurring = !!body.recurring;
      if (body.invoiceTemplate != null)
        data.invoiceTemplate = Number(body.invoiceTemplate);
      if (body.lines?.length) {
        await E.InvoiceDetail.deleteMany({ where: { invoiceId: id } });
        const taxRateTotal = (body.taxes || []).reduce(
          (s: number, t: any) => s + Number(t.rate || 0),
          0,
        );
        const totals = computeLineTotals(
          body.lines,
          body.discountType || inv.discountType,
          body.discountAmount ?? inv.discountAmount,
          taxRateTotal,
        );
        data.subTotal = totals.subTotal;
        data.discountAmount = totals.discountAmount;
        data.totalAmount = totals.totalAmount;
        data.grandTotal = totals.grandTotal;
        data.details = {
          create: body.lines.map((l: any) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            price: Number(l.price),
          })),
        };
      }
      const updated = await E.Invoice.update({
        where: { id },
        data,
        include: { customer: true, details: true },
      });
      return res.json({ ...updated, dueAmount: dueAmount(updated) });
    }
    if (
      path.match(/^invoices\/[^/]+\/clone$/) ||
      path.match(/^invoice-clone\/[^/]+$/)
    ) {
      if (method === "POST") {
        const parts = path.split("/").filter(Boolean);
        const id =
          path.startsWith("invoice-clone/")
            ? parts[1]
            : parts[1]; // invoices/:id/clone
        const src = await E.Invoice.findFirst({
          where: { id, tenantId },
          include: { details: true, taxes: true },
        });
        if (!src) throw new HttpError(404, "Invoice not found");
        await assertWithinPlanLimit(E as any, tenantId, "invoices");
        const last = await E.Invoice.findFirst({
          where: { tenantId },
          orderBy: { invoiceNumber: "desc" },
        });
        const invoiceNumber = (last?.invoiceNumber || 0) + 1;
        const clone = await E.Invoice.create({
          data: {
            tenantId,
            customerId: src.customerId,
            createdById: user.id,
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 14 * 86400000),
            invoiceNumber,
            invoiceFullNumber: formatDocNumber("INV", invoiceNumber),
            referenceNumber: `clone-of-${src.id}`,
            status: "due",
            subTotal: src.subTotal,
            discountType: src.discountType,
            discountAmount: src.discountAmount,
            totalAmount: src.totalAmount,
            grandTotal: src.grandTotal,
            receivedAmount: 0,
            note: src.note,
            invoiceTemplate: src.invoiceTemplate,
            portalToken: crypto.randomBytes(24).toString("hex"),
            details: {
              create: src.details.map((d) => ({
                productId: d.productId,
                quantity: d.quantity,
                price: d.price,
              })),
            },
            taxes: {
              create: src.taxes
                .filter((t) => t.taxId)
                .map((t) => ({
                  taxId: t.taxId,
                  rate: t.rate,
                  amount: t.amount,
                })),
            },
          },
          include: { customer: true },
        });
        return res.status(201).json({ ...clone, dueAmount: dueAmount(clone) });
      }
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
      const where: any = { tenantId };
      if (q.status) where.status = String(q.status);
      if (q.customerId) where.customerId = String(q.customerId);
      return res.json(
        await E.Estimate.findMany({
          where,
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
            portalToken: crypto.randomBytes(24).toString("hex"),
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
      let plans = await E.Plan.findMany({
        where: { status: "active" },
        orderBy: { price: "asc" },
      });
      if (!plans.length) {
        await E.Plan.createMany({
          data: [
            {
              name: "Free",
              tag: "free",
              frequency: "monthly",
              price: 0,
              isFree: true,
              isDefault: true,
              trialDays: 14,
              numberOfProducts: 20,
              numberOfCustomers: 20,
              numberOfEstimates: 50,
              numberOfInvoices: 50,
              status: "active",
            },
            {
              name: "Business",
              tag: "business",
              frequency: "monthly",
              price: 29,
              isFree: false,
              numberOfProducts: 200,
              numberOfCustomers: 500,
              numberOfEstimates: 1000,
              numberOfInvoices: 1000,
              status: "active",
            },
          ],
        });
        plans = await E.Plan.findMany({
          where: { status: "active" },
          orderBy: { price: "asc" },
        });
      }
      return res.json(plans);
    }

    if (path === "taxes" && method === "GET") {
      return res.json(await E.Tax.findMany({ where: { tenantId } }));
    }
    if (path === "taxes" && method === "POST") {
      return res.status(201).json(
        await E.Tax.create({
          data: {
            tenantId,
            name: body.name || "Tax",
            rate: Number(body.rate) || 0,
          },
        }),
      );
    }
    if (path.startsWith("taxes/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Tax.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Tax.update({
          where: { id },
          data: {
            name: body.name ?? existing.name,
            rate: body.rate != null ? Number(body.rate) : existing.rate,
          },
        }),
      );
    }
    if (path.startsWith("taxes/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Tax.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Tax.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Notes
    if (path === "notes" && method === "GET") {
      const where: any = { tenantId };
      if (q.type) where.type = String(q.type);
      return res.json(
        await E.Note.findMany({ where, orderBy: { createdAt: "desc" } }),
      );
    }
    if (path === "notes" && method === "POST") {
      return res.status(201).json(
        await E.Note.create({
          data: {
            tenantId,
            type: body.type || "invoice",
            name: body.name || "Note",
            note: body.note || body.body || "",
          },
        }),
      );
    }
    if (path.startsWith("notes/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Note.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Note.update({
          where: { id },
          data: {
            name: body.name ?? existing.name,
            note: body.note ?? body.body ?? existing.note,
            type: body.type ?? existing.type,
          },
        }),
      );
    }
    if (path.startsWith("notes/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Note.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Note.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Payment methods
    if (
      (path === "payment-methods" ||
        path === "selected/payment-methods" ||
        path === "selected/customer-payment-method") &&
      method === "GET"
    ) {
      return res.json(
        await E.PaymentMethod.findMany({
          where: { OR: [{ tenantId }, { tenantId: null }] },
          orderBy: { name: "asc" },
        }),
      );
    }
    if (path === "payment-methods" && method === "POST") {
      return res.status(201).json(
        await E.PaymentMethod.create({
          data: {
            tenantId,
            name: body.name || "Cash",
            type: body.type || "cash",
          },
        }),
      );
    }
    if (path.startsWith("payment-methods/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.PaymentMethod.findFirst({
        where: { id, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.PaymentMethod.update({
          where: { id },
          data: {
            name: body.name ?? existing.name,
            type: body.type ?? existing.type,
          },
        }),
      );
    }
    if (path.startsWith("payment-methods/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.PaymentMethod.findFirst({
        where: { id, tenantId },
      });
      if (!existing) throw new HttpError(404);
      await E.PaymentMethod.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Categories / units
    if (
      (path === "categories" || path === "selected/categories") &&
      method === "GET"
    ) {
      const where: any = { tenantId };
      if (q.type) where.type = String(q.type);
      return res.json(
        await E.Category.findMany({ where, orderBy: { name: "asc" } }),
      );
    }
    if (path === "categories" && method === "POST") {
      return res.status(201).json(
        await E.Category.create({
          data: {
            tenantId,
            name: body.name || "Category",
            type: body.type || "expense",
          },
        }),
      );
    }
    if (path.startsWith("categories/") && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Category.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Category.update({
          where: { id },
          data: {
            name: body.name ?? existing.name,
            type: body.type ?? existing.type,
          },
        }),
      );
    }
    if (path.startsWith("categories/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Category.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Category.delete({ where: { id } });
      return res.json({ ok: true });
    }
    if ((path === "units" || path === "selected/units") && method === "GET") {
      return res.json(
        await E.Unit.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      );
    }
    if (path === "units" && method === "POST") {
      return res.status(201).json(
        await E.Unit.create({
          data: {
            tenantId,
            name: body.name || "Unit",
            shortName: body.shortName || body.name || "u",
          },
        }),
      );
    }

    // Notifications
    if (
      (path === "notifications" || path === "app/mobile/notifications") &&
      method === "GET"
    ) {
      return res.json(
        await E.Notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    }
    if (
      path.match(/^notifications\/[^/]+\/read$/) ||
      path.match(/^app\/read-notifications\/[^/]+$/)
    ) {
      if (method === "POST" || method === "PUT") {
        const id = path.split("/").filter(Boolean).pop()!;
        const n = await E.Notification.findFirst({
          where: { id, userId: user.id },
        });
        if (!n) throw new HttpError(404);
        return res.json(
          await E.Notification.update({
            where: { id },
            data: { isRead: true },
          }),
        );
      }
    }
    if (
      (path === "read-all-notifications" ||
        path === "notifications/read-all") &&
      (method === "POST" || method === "PUT")
    ) {
      await E.Notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return res.json({ ok: true });
    }

    // Permissions / roles / users
    if (
      (path === "my-permissions" || path === "permissions") &&
      method === "GET"
    ) {
      const roleUsers = await E.RoleUser.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      const perms = new Set<string>();
      for (const ru of roleUsers) {
        try {
          const p = JSON.parse(ru.role.permissions || "[]");
          if (Array.isArray(p)) p.forEach((x: string) => perms.add(x));
        } catch {
          /* ignore */
        }
      }
      // Owners / subscribers get full set when no roles assigned
      if (!perms.size) {
        PERMISSIONS.forEach((p) => perms.add(p));
      }
      return res.json({ permissions: [...perms], all: PERMISSIONS });
    }
    if ((path === "roles" || path === "selected/roles") && method === "GET") {
      return res.json(
        await E.Role.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
        }),
      );
    }
    if (path === "roles" && method === "POST") {
      return res.status(201).json(
        await E.Role.create({
          data: {
            tenantId,
            name: body.name || "Role",
            permissions: JSON.stringify(body.permissions || []),
          },
        }),
      );
    }
    if (path === "users" && method === "GET") {
      return res.json(
        await E.User.findMany({
          where: { tenantId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path === "user-invite" && method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) throw new HttpError(400, "Email required");
      const token = crypto.randomBytes(16).toString("hex");
      const invite = await E.UserInvite.create({
        data: {
          tenantId,
          email,
          roleId: body.roleId || null,
          invitedById: user.id,
          token,
          status: "pending",
        },
      });
      await E.Notification.create({
        data: {
          tenantId,
          userId: user.id,
          title: "Invite sent",
          body: `Invite created for ${email}`,
          link: "/users",
        },
      });
      return res.status(201).json(invite);
    }

    // Billing history + plan activate
    if ((path === "billings" || path === "billing") && method === "GET") {
      return res.json(
        await E.BillingHistory.findMany({
          where: { tenantId },
          include: { plan: true, paymentMethod: true },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (
      (path === "plan-buy" || path === "plans/activate" || path === "activate-plan") &&
      method === "POST"
    ) {
      const planId = body.planId || body.id;
      const plan = await E.Plan.findFirst({
        where: { id: planId, status: "active" },
      });
      if (!plan) throw new HttpError(404, "Plan not found");
      const start = new Date();
      let end: Date | null = null;
      if (!plan.isFree) {
        end = new Date(start);
        if (plan.frequency === "yearly") end.setFullYear(end.getFullYear() + 1);
        else end.setMonth(end.getMonth() + 1);
      }
      const subscriber = await E.Subscriber.create({
        data: {
          userId: user.id,
          planId: plan.id,
          tenantId,
          startDate: start,
          endDate: end,
        },
      });
      await E.BillingHistory.create({
        data: {
          invoiceNumber: `SUB-${Date.now()}`,
          paidById: user.id,
          subscriberId: subscriber.id,
          planId: plan.id,
          tenantId,
          status: plan.isFree || plan.price === 0 ? "paid" : "due",
          amount: plan.price,
        },
      });
      await E.Tenant.update({
        where: { id: tenantId },
        data: { status: "active" },
      });
      await E.User.update({
        where: { id: user.id },
        data: {
          isSubscriber: true,
          subscriptionPlan: plan.tag || plan.name,
          subscriptionStatus:
            plan.isFree || plan.price === 0 ? "active" : "past_due",
          datePaid: plan.isFree || plan.price === 0 ? new Date() : null,
        },
      });
      await E.Notification.create({
        data: {
          tenantId,
          userId: user.id,
          title: "Plan activated",
          body: `${plan.name} is now your active plan.`,
          link: "/billing",
        },
      });
      return res.json({ subscriber, plan });
    }

    // Customizations / company settings
    if (
      (path === "customizations" || path === "settings") &&
      method === "GET"
    ) {
      const rows = await E.Customization.findMany({ where: { tenantId } });
      const map: Record<string, any> = {};
      for (const r of rows) {
        try {
          map[r.key] = JSON.parse(r.value);
        } catch {
          map[r.key] = r.value;
        }
      }
      return res.json(map);
    }
    if (
      (path === "customizations" ||
        path === "settings" ||
        path === "invoice-setting" ||
        path === "estimate-setting" ||
        path === "payment-setting") &&
      method === "PUT"
    ) {
      const key =
        path === "invoice-setting"
          ? "invoice"
          : path === "estimate-setting"
            ? "estimate"
            : path === "payment-setting"
              ? "payment"
              : body.key || "app";
      const value =
        typeof body.value === "string"
          ? body.value
          : JSON.stringify(body.value ?? body);
      const row = await E.Customization.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, value },
        update: { value },
      });
      return res.json(row);
    }

    // Account delete request
    if (
      (path === "account-delete-request" || path === "my-profile/delete") &&
      method === "POST"
    ) {
      await E.Customization.upsert({
        where: {
          tenantId_key: { tenantId, key: "account_delete_request" },
        },
        create: {
          tenantId,
          key: "account_delete_request",
          value: JSON.stringify({
            userId: user.id,
            email: user.email,
            at: new Date().toISOString(),
            reason: body.reason || null,
          }),
        },
        update: {
          value: JSON.stringify({
            userId: user.id,
            email: user.email,
            at: new Date().toISOString(),
            reason: body.reason || null,
          }),
        },
      });
      await E.Notification.create({
        data: {
          tenantId,
          userId: user.id,
          title: "Account deletion requested",
          body: "Your account deletion request was recorded.",
        },
      });
      return res.json({ ok: true, message: "Deletion request recorded" });
    }

    // Dashboard extras
    if (path === "payment-overview" && method === "GET") {
      const txs = await E.Transaction.findMany({
        where: { tenantId },
        select: { amount: true, receivedOn: true },
      });
      const byMonth: Record<string, number> = {};
      for (const t of txs) {
        const k = t.receivedOn.toISOString().slice(0, 7);
        byMonth[k] = (byMonth[k] || 0) + t.amount;
      }
      return res.json({
        total: txs.reduce((s, t) => s + t.amount, 0),
        byMonth,
      });
    }
    if (path === "top-customer-transactions" && method === "GET") {
      const customers = await E.Customer.findMany({
        where: { tenantId },
        include: { transactions: { select: { amount: true } } },
        take: 50,
      });
      const ranked = customers
        .map((c) => ({
          customer: c,
          total: c.transactions.reduce((s, t) => s + t.amount, 0),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      return res.json(ranked);
    }
    if (path === "income-expense-overview" && method === "GET") {
      const [invoices, expenses] = await Promise.all([
        E.Invoice.findMany({
          where: { tenantId },
          select: { receivedAmount: true, grandTotal: true },
        }),
        E.Expense.findMany({
          where: { tenantId },
          select: { amount: true },
        }),
      ]);
      return res.json({
        income: invoices.reduce((s, i) => s + i.receivedAmount, 0),
        billed: invoices.reduce((s, i) => s + i.grandTotal, 0),
        expenses: expenses.reduce((s, e) => s + e.amount, 0),
      });
    }
    if (path === "ticket-overview" && method === "GET") {
      const tickets = await E.Ticket.findMany({
        where: { tenantId },
        select: { status: true },
      });
      const byStatus: Record<string, number> = {};
      for (const t of tickets) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      }
      return res.json({ total: tickets.length, byStatus });
    }

    // Selected dropdowns (Flutter parity)
    if (path === "selected/customers" && method === "GET") {
      return res.json(
        await E.Customer.findMany({
          where: { tenantId, status: "active" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
          },
          orderBy: { firstName: "asc" },
        }),
      );
    }
    if (path === "selected/products" && method === "GET") {
      return res.json(
        await E.Product.findMany({
          where: { tenantId },
          orderBy: { name: "asc" },
        }),
      );
    }
    if (path === "selected/taxes" && method === "GET") {
      return res.json(await E.Tax.findMany({ where: { tenantId } }));
    }
    if (path === "selected/notes" && method === "GET") {
      const where: any = { tenantId };
      if (q.type) where.type = String(q.type);
      return res.json(await E.Note.findMany({ where }));
    }
    if (path === "selected/discount-types" && method === "GET") {
      return res.json([
        { id: "none", name: "None" },
        { id: "fixed", name: "Fixed" },
        { id: "percentage", name: "Percentage" },
      ]);
    }
    if (path === "selected/note-types" && method === "GET") {
      return res.json([
        { id: "invoice", name: "Invoice" },
        { id: "estimate", name: "Estimate" },
        { id: "payment", name: "Payment" },
      ]);
    }
    if (path === "selected/departments" && method === "GET") {
      return res.json(await E.Department.findMany({ orderBy: { name: "asc" } }));
    }
    if (path === "selected/priorities" && method === "GET") {
      return res.json(await E.Priority.findMany({ orderBy: { name: "asc" } }));
    }
    if (path === "selected/my-plans" && method === "GET") {
      return res.json(
        await E.Plan.findMany({
          where: { status: "active" },
          orderBy: { price: "asc" },
        }),
      );
    }

    // Expense update + product get one
    if (path.match(/^expenses\/[^/]+$/) && method === "GET") {
      const id = path.split("/")[1];
      const row = await E.Expense.findFirst({
        where: { id, tenantId },
        include: { category: true },
      });
      if (!row) throw new HttpError(404);
      return res.json(row);
    }
    if (path.match(/^expenses\/[^/]+$/) && method === "PUT") {
      const id = path.split("/")[1];
      const existing = await E.Expense.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      return res.json(
        await E.Expense.update({
          where: { id },
          data: {
            title: body.title ?? existing.title,
            amount:
              body.amount != null ? Number(body.amount) : existing.amount,
            date: body.date ? new Date(body.date) : existing.date,
            reference: body.reference ?? existing.reference,
            note: body.note ?? existing.note,
            categoryId: body.categoryId ?? existing.categoryId,
          },
        }),
      );
    }
    if (path.match(/^products\/[^/]+$/) && method === "GET") {
      const id = path.split("/")[1];
      const row = await E.Product.findFirst({ where: { id, tenantId } });
      if (!row) throw new HttpError(404);
      return res.json(row);
    }

    // Estimate detail / status / document
    if (path.match(/^estimates\/[^/]+$/) && method === "GET") {
      const id = path.split("/")[1];
      const est = await E.Estimate.findFirst({
        where: { id, tenantId },
        include: {
          customer: true,
          details: { include: { product: true } },
          taxes: true,
        },
      });
      if (!est) throw new HttpError(404);
      return res.json(est);
    }
    if (
      (path.match(/^estimates\/[^/]+\/status$/) ||
        path.match(/^estimate-status-change\/[^/]+$/)) &&
      method === "POST"
    ) {
      const id = path.includes("estimate-status")
        ? path.split("/").pop()!
        : path.split("/")[1];
      const est = await E.Estimate.findFirst({ where: { id, tenantId } });
      if (!est) throw new HttpError(404);
      return res.json(
        await E.Estimate.update({
          where: { id },
          data: { status: body.status || est.status },
        }),
      );
    }
    if (path.match(/^estimates\/[^/]+\/document$/) && method === "GET") {
      const id = path.split("/")[1];
      const estimate = await E.Estimate.findFirst({
        where: { id, tenantId },
        include: {
          customer: true,
          details: { include: { product: true } },
          taxes: { include: { tax: true } },
          tenant: true,
        },
      });
      if (!estimate) throw new HttpError(404);
      const html = buildDocumentHtml({
        fullNumber: estimate.estimateFullNumber,
        dateLabel: `Date ${estimate.date.toLocaleDateString()}`,
        status: estimate.status,
        subTotal: estimate.subTotal,
        discountAmount: estimate.discountAmount,
        grandTotal: estimate.grandTotal,
        note: estimate.note,
        companyName: estimate.tenant.name,
        customerName: customerDisplay(estimate.customer),
        customerEmail: estimate.customer.email,
        customerAddress: estimate.customer.address,
        lines: estimate.details.map((d) => ({
          name: d.product.name,
          quantity: d.quantity,
          price: d.price,
        })),
        taxes: estimate.taxes.map((t) => ({
          name: t.tax?.name || "Tax",
          rate: t.rate,
          amount: t.amount,
        })),
      });
      const taxAmount = estimate.taxes.reduce((s, t) => s + t.amount, 0);
      const bytes = await buildPdfBytes({
        title: "ESTIMATE",
        fullNumber: estimate.estimateFullNumber,
        companyName: estimate.tenant.name,
        customerName: customerDisplay(estimate.customer),
        customerEmail: estimate.customer.email,
        customerAddress: estimate.customer.address,
        dateLabel: estimate.date.toLocaleDateString(),
        status: estimate.status,
        subTotal: estimate.subTotal,
        discountAmount: estimate.discountAmount || 0,
        taxAmount,
        grandTotal: estimate.grandTotal,
        note: estimate.note,
        lines: estimate.details.map((d) => ({
          name: d.product.name,
          quantity: d.quantity,
          price: d.price,
        })),
      });
      return res.json({
        html,
        fullNumber: estimate.estimateFullNumber,
        pdfBase64: toBase64(bytes),
        filename: `${estimate.estimateFullNumber}.pdf`,
      });
    }
    if (path.startsWith("estimates/") && method === "DELETE") {
      const id = path.split("/")[1];
      const existing = await E.Estimate.findFirst({ where: { id, tenantId } });
      if (!existing) throw new HttpError(404);
      await E.Estimate.delete({ where: { id } });
      return res.json({ ok: true });
    }

    // Ticket status
    if (
      path.match(/^tickets\/[^/]+\/status$/) &&
      (method === "POST" || method === "PUT")
    ) {
      const id = path.split("/")[1];
      const t = await E.Ticket.findFirst({ where: { id, tenantId } });
      if (!t) throw new HttpError(404);
      return res.json(
        await E.Ticket.update({
          where: { id },
          data: { status: body.status || t.status },
        }),
      );
    }

    // Customer sub-resources
    if (path.match(/^customers\/[^/]+\/invoices$/) && method === "GET") {
      const customerId = path.split("/")[1];
      const rows = await E.Invoice.findMany({
        where: { tenantId, customerId },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows.map((i) => ({ ...i, dueAmount: dueAmount(i) })));
    }
    if (path.match(/^customers\/[^/]+\/estimates$/) && method === "GET") {
      const customerId = path.split("/")[1];
      return res.json(
        await E.Estimate.findMany({
          where: { tenantId, customerId },
          orderBy: { createdAt: "desc" },
        }),
      );
    }
    if (path.match(/^customers\/[^/]+\/transactions$/) && method === "GET") {
      const customerId = path.split("/")[1];
      return res.json(
        await E.Transaction.findMany({
          where: { tenantId, customerId },
          orderBy: { receivedOn: "desc" },
        }),
      );
    }

    // Subscription expiry check for mobile gate
    if (path === "subscription-status" && method === "GET") {
      const tenant = await E.Tenant.findUnique({ where: { id: tenantId } });
      const subscriber = await E.Subscriber.findFirst({
        where: { tenantId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      });
      const expired =
        tenant?.status === "expired" ||
        (subscriber?.endDate != null && subscriber.endDate < new Date());
      return res.json({
        expired,
        tenantStatus: tenant?.status,
        subscriber,
      });
    }

    throw new HttpError(404, `Unknown mobile route: ${method} ${path}`);
  } catch (err: any) {
    const status = err?.statusCode || 500;
    return res.status(status).json({
      message: err?.message || "Mobile API error",
    });
  }
};
