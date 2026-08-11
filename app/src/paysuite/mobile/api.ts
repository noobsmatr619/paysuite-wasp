import { HttpError } from "wasp/server";
import type { MobileApi } from "wasp/server/api";
import type { PrismaClient } from "@prisma/client";

/**
 * Lightweight JSON helpers for the Expo mobile client.
 * Auth: pass `Authorization: Bearer <userId>` in development
 * (Wasp session cookies work for web; mobile uses this bridge token).
 *
 * For production, swap this for proper JWT/Sanctum-style tokens.
 */
async function resolveUser(
  req: { headers: Record<string, any> },
  entities: { User: PrismaClient["user"] },
) {
  const auth = req.headers["authorization"] || req.headers["Authorization"];
  if (!auth || typeof auth !== "string") {
    throw new HttpError(401, "Missing Authorization header");
  }
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const user = await entities.User.findUnique({ where: { id: token } });
  if (!user) throw new HttpError(401, "Invalid token");
  return user;
}

async function tenantIdFor(
  user: { id: string; tenantId: string | null; username: string | null; email: string | null; companyName: string | null },
  entities: {
    User: PrismaClient["user"];
    Tenant: PrismaClient["tenant"];
  },
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

export const mobileApi: MobileApi = async (req, res, context) => {
  try {
    const path = (req.path || "").replace(/^\/api\/mobile\/?/, "");
    const method = (req.method || "GET").toUpperCase();
    const user = await resolveUser(req as any, context.entities);
    const tenantId = await tenantIdFor(user as any, context.entities);

    // GET statistics
    if (method === "GET" && (path === "statistics" || path === "")) {
      const [customers, invoices, products, expenses] = await Promise.all([
        context.entities.Customer.count({ where: { tenantId } }),
        context.entities.Invoice.findMany({
          where: { tenantId },
          select: { grandTotal: true, receivedAmount: true, status: true },
        }),
        context.entities.Product.count({ where: { tenantId } }),
        context.entities.Expense.findMany({
          where: { tenantId },
          select: { amount: true },
        }),
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

    if (method === "GET" && path === "customers") {
      const rows = await context.entities.Customer.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    if (method === "POST" && path === "customers") {
      const body = req.body || {};
      const created = await context.entities.Customer.create({
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
      });
      return res.status(201).json(created);
    }

    if (method === "GET" && path === "invoices") {
      const rows = await context.entities.Invoice.findMany({
        where: { tenantId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json(
        rows.map((i) => ({
          ...i,
          dueAmount: Math.max(0, i.grandTotal - i.receivedAmount),
        })),
      );
    }

    if (method === "GET" && path === "products") {
      const rows = await context.entities.Product.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    if (method === "POST" && path === "products") {
      const body = req.body || {};
      const created = await context.entities.Product.create({
        data: {
          tenantId,
          name: body.name || "Product",
          price: Number(body.price) || 0,
          code: body.code || null,
          description: body.description || null,
        },
      });
      return res.status(201).json(created);
    }

    if (method === "GET" && path === "estimates") {
      const rows = await context.entities.Estimate.findMany({
        where: { tenantId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    if (method === "GET" && path === "expenses") {
      const rows = await context.entities.Expense.findMany({
        where: { tenantId },
        include: { category: true },
        orderBy: { date: "desc" },
      });
      return res.json(rows);
    }

    if (method === "GET" && path === "tickets") {
      const rows = await context.entities.Ticket.findMany({
        where: { tenantId },
        include: { department: true, priority: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json(rows);
    }

    if (method === "GET" && path === "transactions") {
      const rows = await context.entities.Transaction.findMany({
        where: { tenantId },
        include: { customer: true, paymentMethod: true },
        orderBy: { receivedOn: "desc" },
      });
      return res.json(rows);
    }

    if (method === "GET" && path === "my-profile") {
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

    if (method === "GET" && path === "my-plan") {
      const subscriber = await context.entities.Subscriber.findFirst({
        where: { tenantId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ subscriber });
    }

    throw new HttpError(404, `Unknown mobile route: ${method} ${path}`);
  } catch (err: any) {
    const status = err?.statusCode || 500;
    return res.status(status).json({
      message: err?.message || "Mobile API error",
    });
  }
};
