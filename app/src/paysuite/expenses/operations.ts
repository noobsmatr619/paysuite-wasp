import { assertPermission } from "../shared/planLimits";
import { HttpError } from "wasp/server";
import type {
  GetExpenses,
  GetExpense,
  CreateExpense,
  UpdateExpense,
  DeleteExpense,
} from "wasp/server/operations";
import type { Expense } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";
import type { ExpenseInput } from "../shared/types";

export const getExpenses: GetExpenses<
  { search?: string; categoryId?: string },
  any[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Expense.findMany({
    where: {
      tenantId,
      ...(args?.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args?.search
        ? {
            OR: [
              { title: { contains: args.search, mode: "insensitive" } },
              { reference: { contains: args.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { category: true },
    orderBy: { date: "desc" },
  });
};

export const getExpense: GetExpense<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const expense = await context.entities.Expense.findFirst({
    where: { id: args.id, tenantId },
    include: { category: true },
  });
  if (!expense) throw new HttpError(404, "Expense not found");
  return expense;
};

export const createExpense: CreateExpense<ExpenseInput, Expense> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "expenses.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  if (!args.title?.trim()) throw new HttpError(400, "Title is required");
  if (!args.categoryId) throw new HttpError(400, "Category is required");
  if (args.amount == null || args.amount < 0) {
    throw new HttpError(400, "Valid amount is required");
  }

  return context.entities.Expense.create({
    data: {
      tenantId,
      title: args.title.trim(),
      date: new Date(args.date),
      amount: args.amount,
      categoryId: args.categoryId,
      reference: args.reference ?? null,
      note: args.note ?? null,
    },
  });
};

export const updateExpense: UpdateExpense<
  ExpenseInput & { id: string },
  Expense
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "expenses.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Expense.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Expense not found");

  return context.entities.Expense.update({
    where: { id: args.id },
    data: {
      title: args.title?.trim() || existing.title,
      date: args.date ? new Date(args.date) : existing.date,
      amount: args.amount ?? existing.amount,
      categoryId: args.categoryId || existing.categoryId,
      reference: args.reference ?? existing.reference,
      note: args.note ?? existing.note,
    },
  });
};

export const deleteExpense: DeleteExpense<{ id: string }, Expense> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  await assertPermission(context.entities as any, context.user!.id, "expenses.manage");
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Expense.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Expense not found");
  return context.entities.Expense.delete({ where: { id: args.id } });
};
