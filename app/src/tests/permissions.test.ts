import { describe, expect, it, vi } from "vitest";
import { assertPermission, userHasPermission } from "../paysuite/shared/planLimits";

function entities(user: any, roleUsers: any[]) {
  return {
    User: { findUnique: vi.fn().mockResolvedValue(user) },
    RoleUser: { findMany: vi.fn().mockResolvedValue(roleUsers) }
  } as any;
}

const member = { id: "u1", isAdmin: false, isSubscriber: false };
const role = (perms: string[]) => ({ role: { permissions: JSON.stringify(perms) } });

describe("permission checks", () => {
  it("grants admins and subscribers everything", async () => {
    await expect(
      userHasPermission(entities({ ...member, isAdmin: true }, []), "u1", "invoices.manage")
    ).resolves.toBe(true);
    await expect(
      userHasPermission(entities({ ...member, isSubscriber: true }, []), "u1", "invoices.manage")
    ).resolves.toBe(true);
  });

  it("grants a permission the role holds and denies one it does not", async () => {
    const e = entities(member, [role(["invoices.view", "invoices.manage"])]);
    await expect(userHasPermission(e, "u1", "invoices.manage")).resolves.toBe(true);
    await expect(userHasPermission(e, "u1", "customers.manage")).resolves.toBe(false);
  });

  it("honours the wildcard", async () => {
    const e = entities(member, [role(["*"])]);
    await expect(userHasPermission(e, "u1", "settings.manage")).resolves.toBe(true);
  });

  it("unions permissions across multiple roles", async () => {
    const e = entities(member, [role(["customers.view"]), role(["invoices.manage"])]);
    await expect(userHasPermission(e, "u1", "invoices.manage")).resolves.toBe(true);
  });

  it("denies when a role's permissions JSON is unparseable", async () => {
    const e = entities(member, [{ role: { permissions: "not json" } }]);
    await expect(userHasPermission(e, "u1", "invoices.manage")).resolves.toBe(false);
  });

  it("denies an unknown user", async () => {
    await expect(userHasPermission(entities(null, []), "nope", "invoices.manage")).resolves.toBe(false);
  });

  it("assertPermission throws 403 with the missing key", async () => {
    const e = entities(member, [role(["customers.view"])]);
    await expect(assertPermission(e, "u1", "invoices.manage")).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it("assertPermission resolves when the permission is held", async () => {
    const e = entities(member, [role(["invoices.manage"])]);
    await expect(assertPermission(e, "u1", "invoices.manage")).resolves.toBeUndefined();
  });

  /**
   * Documents current behaviour, which is fail-open: a user with no role
   * assigned passes every check. Laravel's PermissionMiddleware is fail-closed
   * — it denies unless the permission is present. Flipping this would lock out
   * any existing user who has no role, so it is left as-is and flagged.
   */
  it("currently grants everything to a user with no roles (fail-open)", async () => {
    const e = entities(member, []);
    await expect(userHasPermission(e, "u1", "settings.manage")).resolves.toBe(true);
  });
});
