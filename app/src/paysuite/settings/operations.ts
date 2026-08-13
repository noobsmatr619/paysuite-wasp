import { HttpError } from "wasp/server";
import { emailSender } from "wasp/server/email";
import { requireTenantId } from "../shared/tenant";

export const getCustomizations: any = async (_args: void, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const rows = await context.entities.Customization.findMany({
    where: { tenantId },
  });
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  return map;
};

export const upsertCustomization: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const key = String(args.key || "app");
  const value =
    typeof args.value === "string" ? args.value : JSON.stringify(args.value ?? {});
  return context.entities.Customization.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value },
    update: { value },
  });
};

/** Email templates stored as customization keys email_template:* */
export const getEmailTemplates: any = async (_args: void, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const rows = await context.entities.Customization.findMany({
    where: { tenantId, key: { startsWith: "email_template:" } },
  });
  return rows.map((r: any) => {
    let body: any = r.value;
    try {
      body = JSON.parse(r.value);
    } catch {
      /* plain */
    }
    return {
      id: r.id,
      type: r.key.replace("email_template:", ""),
      ...((typeof body === "object" && body) || { body }),
    };
  });
};

export const upsertEmailTemplate: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const type = String(args.type || "invoice");
  const key = `email_template:${type}`;
  const value = JSON.stringify({
    subject: args.subject || `${type} notification`,
    body: args.body || "",
  });
  return context.entities.Customization.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value },
    update: { value },
  });
};

export const requestAccountDelete: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities, {
    allowExpired: true,
  });
  await context.entities.Customization.upsert({
    where: {
      tenantId_key: { tenantId, key: "account_delete_request" },
    },
    create: {
      tenantId,
      key: "account_delete_request",
      value: JSON.stringify({
        userId: context.user.id,
        email: context.user.email,
        at: new Date().toISOString(),
        reason: args?.reason || null,
      }),
    },
    update: {
      value: JSON.stringify({
        userId: context.user.id,
        email: context.user.email,
        at: new Date().toISOString(),
        reason: args?.reason || null,
      }),
    },
  });
  await context.entities.Notification.create({
    data: {
      tenantId,
      userId: context.user.id,
      title: "Account deletion requested",
      body: "Your account deletion request was recorded for landlord review.",
    },
  });
  return { ok: true };
};

/**
 * Laravel serves these as GET account-delete-reason. The reasons are a fixed
 * list there too — the tenant picks one when requesting deletion.
 */
export const ACCOUNT_DELETE_REASONS = [
  "No longer need the service",
  "Too expensive",
  "Missing features I need",
  "Switching to another product",
  "Difficult to use",
  "Other",
] as const;

export const getAccountDeleteReasons: any = async (_args: void, context: any) => {
  if (!context.user) throw new HttpError(401);
  return ACCOUNT_DELETE_REASONS.map((reason, index) => ({ id: index + 1, name: reason }));
};

/**
 * Laravel EmailDeliveryCheckController::sendTestMail — proves the mail setup
 * works before a tenant relies on it for invoices.
 */
export const sendTestEmail: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  await requireTenantId(context.user, context.entities, { allowExpired: true });

  const to = String(args?.emailAddress ?? "").trim();
  const subject = String(args?.subject ?? "").trim();
  const body = String(args?.message ?? "").trim();

  // Same three required fields Laravel validates.
  const errors: string[] = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) errors.push("A valid email address is required");
  if (!subject) errors.push("Subject is required");
  if (!body) errors.push("Message is required");
  if (errors.length) throw new HttpError(422, errors.join(". "));

  try {
    await emailSender.send({ to, subject, text: body, html: `<p>${body}</p>` });
  } catch (e) {
    throw new HttpError(
      502,
      e instanceof Error ? `Mail delivery failed: ${e.message}` : "Mail delivery failed",
    );
  }
  return { ok: true, to };
};

/** Landlord: list companies with filters + status updates */
export const getLandlordCompanies: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");
  const where: any = { isDeleted: false };
  if (args?.status) where.status = String(args.status);
  if (args?.search) {
    const s = String(args.search);
    where.OR = [
      { name: { contains: s, mode: "insensitive" } },
      { slug: { contains: s, mode: "insensitive" } },
    ];
  }
  return context.entities.Tenant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      users: {
        select: { id: true, email: true, firstName: true },
        take: 5,
      },
      subscribers: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          customers: true,
          invoices: true,
          users: true,
        },
      },
    },
    take: 100,
  });
};

export const updateLandlordCompany: any = async (args: any, context: any) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");
  const tenant = await context.entities.Tenant.findUnique({
    where: { id: args.id },
  });
  if (!tenant) throw new HttpError(404);
  return context.entities.Tenant.update({
    where: { id: args.id },
    data: {
      status: args.status ?? tenant.status,
      isDeleted:
        args.isDeleted !== undefined ? !!args.isDeleted : tenant.isDeleted,
      name: args.name ?? tenant.name,
    },
  });
};
