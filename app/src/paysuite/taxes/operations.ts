import { assertPermission } from "../shared/planLimits";
import { HttpError } from "wasp/server";
import type {
  GetTaxes,
  CreateTax,
  UpdateTax,
  DeleteTax,
  GetNotes,
  CreateNote,
  UpdateNote,
  DeleteNote,
} from "wasp/server/operations";
import type { Tax, Note } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";

export const getTaxes: GetTaxes<void, Tax[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Tax.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
};

export const createTax: CreateTax<{ name: string; rate: number }, Tax> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "settings.manage");
    const tenantId = await requireTenantId(context.user, context.entities);
    if (!args.name?.trim()) throw new HttpError(400, "Name is required");
    return context.entities.Tax.create({
      data: {
        tenantId,
        name: args.name.trim(),
        rate: args.rate,
      },
    });
  };

export const updateTax: UpdateTax<
  { id: string; name: string; rate: number },
  Tax
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "settings.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Tax.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Tax not found");
  return context.entities.Tax.update({
    where: { id: args.id },
    data: { name: args.name.trim(), rate: args.rate },
  });
};

export const deleteTax: DeleteTax<{ id: string }, Tax> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "settings.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Tax.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Tax not found");
  return context.entities.Tax.delete({ where: { id: args.id } });
};

export const getNotes: GetNotes<{ type?: string }, Note[]> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Note.findMany({
    where: {
      tenantId,
      ...(args?.type ? { type: args.type } : {}),
    },
    orderBy: { name: "asc" },
  });
};

export const createNote: CreateNote<
  { type: string; name: string; note: string },
  Note
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Note.create({
    data: {
      tenantId,
      type: args.type,
      name: args.name.trim(),
      note: args.note,
    },
  });
};

export const updateNote: UpdateNote<
  { id: string; type: string; name: string; note: string },
  Note
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Note.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Note not found");
  return context.entities.Note.update({
    where: { id: args.id },
    data: {
      type: args.type,
      name: args.name.trim(),
      note: args.note,
    },
  });
};

export const deleteNote: DeleteNote<{ id: string }, Note> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Note.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Note not found");
  return context.entities.Note.delete({ where: { id: args.id } });
};
