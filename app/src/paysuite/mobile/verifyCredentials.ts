import {
  createProviderId,
  findAuthIdentity,
  getProviderDataWithPassword,
  findAuthWithUserBy,
} from "wasp/auth/utils";
import { verifyPassword } from "wasp/auth/password";
import type { User } from "wasp/entities";

/**
 * Verify email+password against Wasp AuthIdentity hashed passwords.
 * Falls back only for issued mobile tokens (handled elsewhere), not shared passwords in prod.
 */
export async function verifyEmailPassword(
  email: string,
  password: string,
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return null;

  const providerId = createProviderId("email", normalized);
  const identity = await findAuthIdentity(providerId);
  if (!identity) return null;

  try {
    const data = getProviderDataWithPassword<"email">(identity.providerData);
    if (!data.hashedPassword) return null;
    await verifyPassword(data.hashedPassword, password);
  } catch {
    return null;
  }

  const auth = await findAuthWithUserBy({
    identities: {
      some: {
        providerName: providerId.providerName,
        providerUserId: providerId.providerUserId,
      },
    },
  });
  return auth?.user ?? null;
}
