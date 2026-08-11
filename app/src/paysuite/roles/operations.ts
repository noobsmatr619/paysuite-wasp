import { HttpError } from "wasp/server";
import type {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
  GetTenantUsers,
  InviteTenantUser,
  AssignUserRole,
  GetNotifications,
  MarkNotificationRead,
  MarkAllNotificationsRead,
  ActivatePlan,
} from "wasp/server/operations";
import { requireTenantId } from "../shared/tenant";
import { assertPermission } from "../shared/planLimits";
import { PERMISSIONS } from "../shared/permissions";
import crypto from "crypto";

export const getRoles: GetRoles<void, any[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Role.findMany({
    where: { tenantId },
    include: { users: { include: { user: true } } },
    orderBy: { name: "asc" },
  });
};

export const createRole: CreateRole<
  { name: string; description?: string; permissions: string[] },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "users.manage");
  if (!args.name?.trim()) throw new HttpError(400, "Name required");
  return context.entities.Role.create({
    data: {
      tenantId,
      name: args.name.trim(),
      description: args.description || null,
      permissions: JSON.stringify(args.permissions?.length ? args.permissions : ["*"]),
    },
  });
};

export const updateRole: UpdateRole<
  { id: string; name?: string; description?: string; permissions?: string[] },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "users.manage");
  const role = await context.entities.Role.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!role) throw new HttpError(404, "Role not found");
  return context.entities.Role.update({
    where: { id: role.id },
    data: {
      name: args.name?.trim() || role.name,
      description: args.description ?? role.description,
      permissions:
        args.permissions != null
          ? JSON.stringify(args.permissions)
          : role.permissions,
    },
  });
};

export const deleteRole: DeleteRole<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "users.manage");
  const role = await context.entities.Role.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!role) throw new HttpError(404, "Role not found");
  return context.entities.Role.delete({ where: { id: role.id } });
};

export const getTenantUsers: GetTenantUsers<void, any[]> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.User.findMany({
    where: { tenantId },
    include: { roles: { include: { role: true } } },
    orderBy: { createdAt: "desc" },
  });
};

export const inviteTenantUser: InviteTenantUser<
  { email: string; roleId?: string | null },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "users.manage");
  const email = args.email?.trim().toLowerCase();
  if (!email) throw new HttpError(400, "Email required");

  const token = crypto.randomBytes(24).toString("hex");
  const invite = await context.entities.UserInvite.create({
    data: {
      tenantId,
      email,
      roleId: args.roleId || null,
      token,
      invitedById: context.user.id,
      status: "pending",
    },
  });

  // Notification for inviter audit trail
  await context.entities.Notification.create({
    data: {
      tenantId,
      userId: context.user.id,
      title: "User invited",
      body: `Invite sent to ${email}`,
      link: "/users",
    },
  });

  return {
    ...invite,
    // In production email the link; Dummy logs it
    joinHint: `User should sign up with ${email}. Invite token: ${token}`,
  };
};

export const assignUserRole: AssignUserRole<
  { userId: string; roleId: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "users.manage");

  const [user, role] = await Promise.all([
    context.entities.User.findFirst({ where: { id: args.userId, tenantId } }),
    context.entities.Role.findFirst({ where: { id: args.roleId, tenantId } }),
  ]);
  if (!user || !role) throw new HttpError(404, "User or role not found");

  return context.entities.RoleUser.upsert({
    where: {
      roleId_userId: { roleId: role.id, userId: user.id },
    },
    create: { roleId: role.id, userId: user.id },
    update: {},
  });
};

export const getNotifications: GetNotifications<void, any[]> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  return context.entities.Notification.findMany({
    where: { userId: context.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
};

export const markNotificationRead: MarkNotificationRead<
  { id: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const n = await context.entities.Notification.findFirst({
    where: { id: args.id, userId: context.user.id },
  });
  if (!n) throw new HttpError(404);
  return context.entities.Notification.update({
    where: { id: n.id },
    data: { isRead: true },
  });
};

export const markAllNotificationsRead: MarkAllNotificationsRead<void, any> =
  async (_args, context) => {
    if (!context.user) throw new HttpError(401);
    await context.entities.Notification.updateMany({
      where: { userId: context.user.id, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  };

/** Activate a SaaS plan for the current tenant (free instantly; paid marks billing). */
export const activatePlan: ActivatePlan<{ planId: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const plan = await context.entities.Plan.findFirst({
    where: { id: args.planId, status: "active" },
  });
  if (!plan) throw new HttpError(404, "Plan not found");

  // End previous open subscriptions conceptually by creating a new row
  const start = new Date();
  let end: Date | null = null;
  if (!plan.isFree) {
    end = new Date(start);
    if (plan.frequency === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
  }

  const subscriber = await context.entities.Subscriber.create({
    data: {
      userId: context.user.id,
      planId: plan.id,
      tenantId,
      startDate: start,
      endDate: end,
    },
  });

  await context.entities.BillingHistory.create({
    data: {
      invoiceNumber: `SUB-${Date.now()}`,
      paidById: context.user.id,
      subscriberId: subscriber.id,
      planId: plan.id,
      tenantId,
      status: plan.isFree || plan.price === 0 ? "paid" : "due",
      amount: plan.price,
    },
  });

  await context.entities.User.update({
    where: { id: context.user.id },
    data: {
      isSubscriber: true,
      subscriptionPlan: plan.tag || plan.name,
      subscriptionStatus: plan.isFree || plan.price === 0 ? "active" : "past_due",
      datePaid: plan.isFree || plan.price === 0 ? new Date() : null,
    },
  });

  await context.entities.Notification.create({
    data: {
      tenantId,
      userId: context.user.id,
      title: "Plan activated",
      body: `${plan.name} is now your active plan.`,
      link: "/plans",
    },
  });

  return { subscriber, plan };
};

export function listPermissionKeys() {
  return [...PERMISSIONS];
}
