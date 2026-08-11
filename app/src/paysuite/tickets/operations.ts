import { HttpError } from "wasp/server";
import type {
  GetTickets,
  GetTicket,
  CreateTicket,
  UpdateTicketStatus,
  AddTicketComment,
  RateTicket,
  GetDepartments,
  GetPriorities,
  EnsureSupportLookups,
} from "wasp/server/operations";
import type { Ticket, Department, Priority } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";
import type { TicketInput } from "../shared/types";

export const ensureSupportLookups: EnsureSupportLookups<void, any> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const [deptCount, priCount] = await Promise.all([
    context.entities.Department.count(),
    context.entities.Priority.count(),
  ]);
  if (deptCount === 0) {
    await context.entities.Department.createMany({
      data: [
        { name: "General" },
        { name: "Billing" },
        { name: "Technical" },
        { name: "Sales" },
      ],
    });
  }
  if (priCount === 0) {
    await context.entities.Priority.createMany({
      data: [
        { name: "Low" },
        { name: "Medium" },
        { name: "High" },
        { name: "Urgent" },
      ],
    });
  }
  return { ok: true };
};

export const getDepartments: GetDepartments<void, Department[]> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  return context.entities.Department.findMany({ orderBy: { name: "asc" } });
};

export const getPriorities: GetPriorities<void, Priority[]> = async (
  _args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  return context.entities.Priority.findMany({ orderBy: { name: "asc" } });
};

export const getTickets: GetTickets<{ status?: string }, any[]> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Ticket.findMany({
    where: {
      tenantId,
      ...(args?.status ? { status: args.status } : {}),
    },
    include: {
      department: true,
      priority: true,
      createdBy: true,
      assignedTo: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getTicket: GetTicket<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const ticket = await context.entities.Ticket.findFirst({
    where: { id: args.id, tenantId },
    include: {
      department: true,
      priority: true,
      createdBy: true,
      assignedTo: true,
      comments: {
        include: { user: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");
  return ticket;
};

export const createTicket: CreateTicket<TicketInput, Ticket> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  if (!args.subject?.trim()) throw new HttpError(400, "Subject is required");

  return context.entities.Ticket.create({
    data: {
      tenantId,
      subject: args.subject.trim(),
      departmentId: args.departmentId,
      priorityId: args.priorityId,
      createdById: context.user.id,
      body: args.body ?? null,
      status: "pending",
    },
  });
};

export const updateTicketStatus: UpdateTicketStatus<
  { id: string; status: string },
  Ticket
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Ticket.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Ticket not found");
  if (!["pending", "open", "solved", "rejected"].includes(args.status)) {
    throw new HttpError(400, "Invalid status");
  }
  return context.entities.Ticket.update({
    where: { id: args.id },
    data: { status: args.status },
  });
};

export const addTicketComment: AddTicketComment<
  { ticketId: string; comment: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const ticket = await context.entities.Ticket.findFirst({
    where: { id: args.ticketId, tenantId },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found");
  if (!args.comment?.trim()) throw new HttpError(400, "Comment is required");

  return context.entities.TicketComment.create({
    data: {
      ticketId: args.ticketId,
      userId: context.user.id,
      comment: args.comment.trim(),
      userType: "tenant",
    },
    include: { user: true },
  });
};

export const rateTicket: RateTicket<
  { id: string; rating: number },
  Ticket
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Ticket.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Ticket not found");
  if (args.rating < 1 || args.rating > 5) {
    throw new HttpError(400, "Rating must be 1-5");
  }
  return context.entities.Ticket.update({
    where: { id: args.id },
    data: { rating: args.rating },
  });
};
