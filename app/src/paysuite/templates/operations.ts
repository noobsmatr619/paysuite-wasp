import { HttpError } from "wasp/server";
import type {
  GetEmailTemplateTypes,
  GetEmailTemplate,
  UpdateEmailTemplate,
} from "wasp/server/operations";

/**
 * Laravel TemplateController. `index` returns the types grouped by group_name;
 * `showTemplate` finds the one template for a type; `update` writes only the
 * subject and the custom body — default_content is what the product ships and
 * stays untouched so a template can always be reset by clearing the override.
 */
export const getEmailTemplateTypes: GetEmailTemplateTypes<
  void,
  Record<string, { id: string; name: string; displayName: string; groupName: string }[]>
> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");

  const types = await context.entities.EmailTemplateType.findMany({
    orderBy: [{ groupName: "asc" }, { displayName: "asc" }],
  });

  const grouped: Record<string, typeof types> = {};
  for (const type of types) {
    (grouped[type.groupName] ??= []).push(type);
  }
  return grouped;
};

export const getEmailTemplate: GetEmailTemplate<{ typeId: string }, any> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");

  return context.entities.EmailTemplate.findFirst({
    where: { templateTypeId: args.typeId },
    include: { templateType: { select: { id: true, name: true, displayName: true } } },
  });
};

export const updateEmailTemplate: UpdateEmailTemplate<
  { id: string; subject: string; description?: string | null },
  { ok: true }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");

  const existing = await context.entities.EmailTemplate.findUnique({
    where: { id: args.id },
  });
  if (!existing) throw new HttpError(404, "Template not found");
  if (!args.subject?.trim()) throw new HttpError(400, "Subject is required");

  await context.entities.EmailTemplate.update({
    where: { id: args.id },
    // An empty override clears back to defaultContent.
    data: {
      subject: args.subject.trim(),
      customContent: args.description?.trim() || null,
    },
  });
  return { ok: true };
};
