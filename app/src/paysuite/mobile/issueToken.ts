import { HttpError } from "wasp/server";
import type { IssueMobileToken } from "wasp/server/operations";
import { signMobileToken } from "./jwt";

/** Authenticated web users can mint a mobile JWT for the Expo app. */
export const issueMobileToken: IssueMobileToken<
  void,
  { token: string; tokenType: "Bearer"; expiresInDays: number }
> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const token = signMobileToken(context.user.id, context.user.email);
  return { token, tokenType: "Bearer", expiresInDays: 7 };
};
