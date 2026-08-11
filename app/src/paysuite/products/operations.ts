import { HttpError } from "wasp/server";
import type {
  GetProducts,
  GetProduct,
  CreateProduct,
  UpdateProduct,
  DeleteProduct,
  GetCategories,
  CreateCategory,
  GetUnits,
  CreateUnit,
} from "wasp/server/operations";
import type { Product, Category, Unit } from "wasp/entities";
import { requireTenantId } from "../shared/tenant";
import { assertWithinPlanLimit, assertPermission } from "../shared/planLimits";
import type { ProductInput } from "../shared/types";

export const getProducts: GetProducts<
  { search?: string; categoryId?: string },
  Product[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);

  return context.entities.Product.findMany({
    where: {
      tenantId,
      ...(args?.categoryId ? { categoryId: args.categoryId } : {}),
      ...(args?.search
        ? {
            OR: [
              { name: { contains: args.search, mode: "insensitive" } },
              { code: { contains: args.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { category: true, unit: true },
    orderBy: { createdAt: "desc" },
  });
};

export const getProduct: GetProduct<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const product = await context.entities.Product.findFirst({
    where: { id: args.id, tenantId },
    include: { category: true, unit: true },
  });
  if (!product) throw new HttpError(404, "Product not found");
  return product;
};

export const createProduct: CreateProduct<ProductInput, Product> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  await assertPermission(context.entities as any, context.user.id, "products.manage");
  await assertWithinPlanLimit(context.entities as any, tenantId, "products");
  if (!args.name?.trim()) throw new HttpError(400, "Name is required");
  if (args.price == null || args.price < 0) {
    throw new HttpError(400, "Valid price is required");
  }

  return context.entities.Product.create({
    data: {
      tenantId,
      name: args.name.trim(),
      price: args.price,
      code: args.code ?? null,
      description: args.description ?? null,
      categoryId: args.categoryId ?? null,
      unitId: args.unitId ?? null,
    },
  });
};

export const updateProduct: UpdateProduct<
  ProductInput & { id: string },
  Product
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Product.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Product not found");

  return context.entities.Product.update({
    where: { id: args.id },
    data: {
      name: args.name?.trim() || existing.name,
      price: args.price ?? existing.price,
      code: args.code ?? existing.code,
      description: args.description ?? existing.description,
      categoryId: args.categoryId ?? existing.categoryId,
      unitId: args.unitId ?? existing.unitId,
    },
  });
};

export const deleteProduct: DeleteProduct<{ id: string }, Product> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const existing = await context.entities.Product.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!existing) throw new HttpError(404, "Product not found");
  return context.entities.Product.delete({ where: { id: args.id } });
};

export const getCategories: GetCategories<
  { type?: string },
  Category[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Category.findMany({
    where: {
      tenantId,
      ...(args?.type ? { type: args.type } : {}),
    },
    orderBy: { name: "asc" },
  });
};

export const createCategory: CreateCategory<
  { name: string; type: string },
  Category
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  if (!args.name?.trim()) throw new HttpError(400, "Name is required");
  return context.entities.Category.create({
    data: {
      tenantId,
      name: args.name.trim(),
      type: args.type || "category",
    },
  });
};

export const getUnits: GetUnits<void, Unit[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Unit.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
};

export const createUnit: CreateUnit<
  { name: string; shortName: string },
  Unit
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Unit.create({
    data: {
      tenantId,
      name: args.name.trim(),
      shortName: args.shortName.trim(),
    },
  });
};
