import { HttpError } from "wasp/server";
import type {
  GetNewsletterSubscribers,
  SubscribeNewsletter,
  DeleteNewsletterSubscriber,
} from "wasp/server/operations";

/**
 * Laravel: landlord `news-latter` lists newsletter subscribers; the marketing
 * site posts to it. The email column is unique, so re-subscribing is a no-op
 * rather than an error, matching the Laravel firstOrCreate.
 */
export const getNewsletterSubscribers: GetNewsletterSubscribers<
  void,
  { id: string; email: string; createdAt: Date }[]
> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");
  return context.entities.Newsletter.findMany({ orderBy: { createdAt: "desc" } });
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subscribeNewsletter: SubscribeNewsletter<
  { email: string },
  { ok: true; alreadySubscribed: boolean }
> = async (args, context) => {
  const email = (args.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address");

  const existing = await context.entities.Newsletter.findUnique({ where: { email } });
  if (existing) return { ok: true, alreadySubscribed: true };

  await context.entities.Newsletter.create({ data: { email } });
  return { ok: true, alreadySubscribed: false };
};

export const deleteNewsletterSubscriber: DeleteNewsletterSubscriber<
  { id: string },
  { ok: true }
> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  if (!context.user.isAdmin) throw new HttpError(403, "Admin only");
  await context.entities.Newsletter.delete({ where: { id: args.id } });
  return { ok: true };
};
