import crypto from "crypto";

/**
 * Lightweight HMAC tokens for the Expo mobile API.
 * Not a full JWT library dependency — payload.signature base64url pairs.
 *
 * Set JWT_SECRET (or MOBILE_JWT_SECRET) in server env for production.
 */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return (
    process.env.MOBILE_JWT_SECRET ||
    process.env.JWT_SECRET ||
    "paysuite-dev-mobile-secret-change-me"
  );
}

export type MobileTokenPayload = {
  sub: string; // userId
  email?: string | null;
  exp: number;
};

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromB64url(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const s = input.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return Buffer.from(s, "base64").toString("utf8");
}

export function signMobileToken(
  userId: string,
  email?: string | null,
  ttlMs = DEFAULT_TTL_MS,
): string {
  const payload: MobileTokenPayload = {
    sub: userId,
    email: email || null,
    exp: Date.now() + ttlMs,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMobileToken(token: string): MobileTokenPayload {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Malformed token");

  const expected = crypto
    .createHmac("sha256", secret())
    .update(body)
    .digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(fromB64url(body)) as MobileTokenPayload;
  if (!payload.sub || !payload.exp) throw new Error("Invalid token payload");
  if (Date.now() > payload.exp) throw new Error("Token expired");
  return payload;
}

/** Accept JWT or legacy bare userId (UUID) for backwards compatibility. */
export function resolveBearerToken(authHeader: string | undefined): {
  kind: "jwt" | "legacy";
  userId: string;
} {
  if (!authHeader) throw new Error("Missing Authorization header");
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Empty token");

  if (token.includes(".")) {
    const payload = verifyMobileToken(token);
    return { kind: "jwt", userId: payload.sub };
  }

  // Legacy: raw user id
  return { kind: "legacy", userId: token };
}
