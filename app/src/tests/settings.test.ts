import { describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("wasp/server/email", () => ({ emailSender: { send: (...a: any[]) => send(...a) } }));
vi.mock("../paysuite/shared/tenant", () => ({
  requireTenantId: vi.fn().mockResolvedValue("tenant-1")
}));

const { ACCOUNT_DELETE_REASONS, getAccountDeleteReasons, sendTestEmail } = await import(
  "../paysuite/settings/operations"
);

const context = { user: { id: "u1", email: "a@b.c" }, entities: {} } as any;

describe("account delete reasons", () => {
  it("requires a signed-in user", async () => {
    await expect(getAccountDeleteReasons(undefined, { entities: {} })).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("returns the reasons as id/name pairs", async () => {
    const rows = await getAccountDeleteReasons(undefined, context);
    expect(rows).toHaveLength(ACCOUNT_DELETE_REASONS.length);
    expect(rows[0]).toMatchObject({ id: 1 });
    expect(rows.map((r: any) => r.name)).toEqual([...ACCOUNT_DELETE_REASONS]);
  });

  it("gives every reason a distinct id", async () => {
    const rows = await getAccountDeleteReasons(undefined, context);
    expect(new Set(rows.map((r: any) => r.id)).size).toBe(rows.length);
  });
});

describe("sendTestEmail", () => {
  const good = { emailAddress: "ops@example.com", subject: "Test", message: "Hello" };

  it("requires a signed-in user", async () => {
    await expect(sendTestEmail(good, { entities: {} })).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects a malformed address", async () => {
    await expect(
      sendTestEmail({ ...good, emailAddress: "not-an-email" }, context)
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("requires subject and message, matching Laravel's validation", async () => {
    await expect(sendTestEmail({ ...good, subject: "" }, context)).rejects.toMatchObject({
      statusCode: 422
    });
    await expect(sendTestEmail({ ...good, message: "  " }, context)).rejects.toMatchObject({
      statusCode: 422
    });
  });

  it("sends and reports the recipient", async () => {
    send.mockClear();
    send.mockResolvedValueOnce(undefined);
    await expect(sendTestEmail(good, context)).resolves.toMatchObject({
      ok: true,
      to: "ops@example.com"
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ops@example.com", subject: "Test" })
    );
  });

  it("surfaces a delivery failure as 502 rather than a generic 500", async () => {
    send.mockClear();
    send.mockRejectedValueOnce(new Error("SMTP refused"));
    await expect(sendTestEmail(good, context)).rejects.toMatchObject({ statusCode: 502 });
  });
});
