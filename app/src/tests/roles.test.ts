import { describe, expect, it, vi } from "vitest";

vi.mock("../paysuite/shared/tenant", () => ({
  requireTenantId: vi.fn().mockResolvedValue("tenant-1")
}));
vi.mock("../paysuite/shared/planLimits", () => ({
  assertPermission: vi.fn().mockResolvedValue(undefined),
  assertWithinPlanLimit: vi.fn().mockResolvedValue(undefined)
}));

const { unassignUserRole } = await import("../paysuite/roles/operations");

/**
 * Laravel exposes detach-user-role/{user}. assignUserRole covered attach only,
 * so a mis-assignment could previously be undone only in the database.
 */
const ctx = (found: boolean, count = 1) =>
  ({
    user: { id: "u1" },
    entities: {
      User: { findFirst: vi.fn().mockResolvedValue(found ? { id: "u2" } : null) },
      Role: { findFirst: vi.fn().mockResolvedValue(found ? { id: "r1" } : null) },
      RoleUser: { deleteMany: vi.fn().mockResolvedValue({ count }) }
    }
  }) as any;

describe("unassignUserRole", () => {
  it("requires a signed-in user", async () => {
    await expect(unassignUserRole({}, { entities: {} } as any)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("404s when the user or role is not in this tenant", async () => {
    await expect(
      unassignUserRole({ userId: "u2", roleId: "r1" }, ctx(false))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("removes the link and reports it", async () => {
    await expect(
      unassignUserRole({ userId: "u2", roleId: "r1" }, ctx(true, 1))
    ).resolves.toEqual({ removed: true });
  });

  it("is idempotent — removing a link that is not there still succeeds", async () => {
    await expect(
      unassignUserRole({ userId: "u2", roleId: "r1" }, ctx(true, 0))
    ).resolves.toEqual({ removed: false });
  });

  it("scopes both lookups to the caller's tenant", async () => {
    const c = ctx(true, 1);
    await unassignUserRole({ userId: "u2", roleId: "r1" }, c);
    expect(c.entities.User.findFirst).toHaveBeenCalledWith({
      where: { id: "u2", tenantId: "tenant-1" }
    });
    expect(c.entities.Role.findFirst).toHaveBeenCalledWith({
      where: { id: "r1", tenantId: "tenant-1" }
    });
  });
});
