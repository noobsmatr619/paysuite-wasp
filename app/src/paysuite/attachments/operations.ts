import { HttpError } from "wasp/server";
import type {
  ListAttachments,
  CreateAttachment,
  DeleteAttachment,
  GetAttachment,
} from "wasp/server/operations";
import { requireTenantId } from "../shared/tenant";

const MAX_BYTES = 1_500_000; // ~1.5MB decoded

export const listAttachments: ListAttachments<
  { ownerType: string; ownerId: string },
  any[]
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  return context.entities.Attachment.findMany({
    where: {
      tenantId,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      ownerType: true,
      ownerId: true,
    },
    orderBy: { createdAt: "desc" },
  });
};

export const getAttachment: GetAttachment<
  { id: string },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const row = await context.entities.Attachment.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!row) throw new HttpError(404, "Attachment not found");
  return row;
};

export const createAttachment: CreateAttachment<
  {
    ownerType: string;
    ownerId: string;
    fileName: string;
    mimeType: string;
    contentBase64: string;
  },
  any
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  if (!["expense", "ticket", "invoice", "estimate"].includes(args.ownerType)) {
    throw new HttpError(400, "Invalid ownerType");
  }
  const raw = (args.contentBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const sizeBytes = Math.floor((raw.length * 3) / 4);
  if (sizeBytes <= 0) throw new HttpError(400, "Empty file");
  if (sizeBytes > MAX_BYTES) {
    throw new HttpError(400, `File too large (max ${MAX_BYTES} bytes)`);
  }

  return context.entities.Attachment.create({
    data: {
      tenantId,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      fileName: args.fileName || "file",
      mimeType: args.mimeType || "application/octet-stream",
      sizeBytes,
      contentBase64: raw,
      uploadedById: context.user.id,
    },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      ownerType: true,
      ownerId: true,
    },
  });
};

export const deleteAttachment: DeleteAttachment<{ id: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  const tenantId = await requireTenantId(context.user, context.entities);
  const row = await context.entities.Attachment.findFirst({
    where: { id: args.id, tenantId },
  });
  if (!row) throw new HttpError(404, "Attachment not found");
  return context.entities.Attachment.delete({ where: { id: row.id } });
};
