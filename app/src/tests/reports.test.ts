import { describe, expect, it, vi } from "vitest";

vi.mock("../paysuite/shared/tenant", () => ({
  requireTenantId: vi.fn().mockResolvedValue("tenant-1")
}));

const ops = await import("../paysuite/reports/operations");

const context = (entities: any) => ({ user: { id: "u1" }, entities });
const many = (rows: any[]) => ({ findMany: vi.fn().mockResolvedValue(rows) });

const d = (m: number, day = 15) => new Date(2026, m, day);

describe("income & expense summary", () => {
  const entities = {
    Invoice: many([
      { issueDate: d(0), grandTotal: 100, receivedAmount: 100, status: "paid" },
      { issueDate: d(0), grandTotal: 50, receivedAmount: 50, status: "paid" },
      { issueDate: d(5), grandTotal: 200, receivedAmount: 200, status: "paid" }
    ]),
    Expense: many([{ date: d(0), amount: 30 }, { date: d(5), amount: 20 }])
  };

  it("returns twelve months whatever the data", async () => {
    const r = await ops.getIncomeExpenseSummary({ year: 2026 }, context(entities));
    expect(r.months).toHaveLength(12);
    expect(r.months[0].month).toBe("Jan");
  });

  it("buckets income and expense into the right month", async () => {
    const r = await ops.getIncomeExpenseSummary({ year: 2026 }, context(entities));
    expect(r.months[0].income).toBe(150);
    expect(r.months[0].expense).toBe(30);
    expect(r.months[5].income).toBe(200);
  });

  it("computes profit per month and in the totals", async () => {
    const r = await ops.getIncomeExpenseSummary({ year: 2026 }, context(entities));
    expect(r.months[0].profit).toBe(120);
    expect(r.totals.income).toBe(350);
    expect(r.totals.expense).toBe(50);
    expect(r.totals.profit).toBe(300);
  });

  it("defaults to the current year", async () => {
    const r = await ops.getIncomeExpenseSummary({}, context(entities));
    expect(r.year).toBe(new Date().getFullYear());
  });

  it("rejects an anonymous caller", async () => {
    await expect(
      ops.getIncomeExpenseSummary({}, { entities } as any)
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("yearly charts", () => {
  it("income chart totals paid invoices by month", async () => {
    const r = await ops.getIncomeYearlyChart({ year: 2026 }, context({
      Invoice: many([{ issueDate: d(2), grandTotal: 75 }, { issueDate: d(2), grandTotal: 25 }])
    }));
    expect(r.months).toHaveLength(12);
    expect(r.months[2].total).toBe(100);
  });

  it("expense chart totals by month", async () => {
    const r = await ops.getExpenseYearlyChart({ year: 2026 }, context({
      Expense: many([{ date: d(11), amount: 40 }])
    }));
    expect(r.months[11].total).toBe(40);
    expect(r.months[0].total).toBe(0);
  });
});

describe("payment yearly summary", () => {
  it("totals amount and count per month", async () => {
    const r = await ops.getPaymentYearlySummary({ year: 2026 }, context({
      Transaction: many([
        { receivedOn: d(1), amount: 10 },
        { receivedOn: d(1), amount: 15 },
        { receivedOn: d(7), amount: 5 }
      ])
    }));
    expect(r.months[1]).toMatchObject({ total: 25, count: 2 });
    expect(r.totals).toMatchObject({ amount: 30, count: 3 });
  });
});

describe("invoice overview", () => {
  const entities = {
    Invoice: many([
      { issueDate: d(0), status: "paid", grandTotal: 100, receivedAmount: 100 },
      { issueDate: d(1), status: "due", grandTotal: 200, receivedAmount: 0 },
      { issueDate: d(2), status: "due", grandTotal: 50, receivedAmount: 20 }
    ])
  };

  it("groups by status with counts and value", async () => {
    const r = await ops.getInvoiceOverview({ year: 2026 }, context(entities));
    const due = r.statuses.find((s: any) => s.status === "due");
    expect(due).toMatchObject({ count: 2, total: 250 });
  });

  it("counts due as grandTotal minus received, never negative", async () => {
    const r = await ops.getInvoiceOverview({ year: 2026 }, context(entities));
    expect(r.totals.due).toBe(230);
    for (const s of r.statuses) expect(s.due).toBeGreaterThanOrEqual(0);
  });

  it("sorts statuses by value", async () => {
    const r = await ops.getInvoiceOverview({ year: 2026 }, context(entities));
    const totals = r.statuses.map((s: any) => s.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });
});

describe("mail setup", () => {
  const withValue = (value: string | null) => ({
    Customization: { findFirst: vi.fn().mockResolvedValue(value === null ? null : { value }) }
  });

  it("reports configured when host and from address are set", async () => {
    const r = await ops.getMailSetupExists(undefined, context(
      withValue(JSON.stringify({ host: "smtp.test", from_address: "a@b.c" }))
    ));
    expect(r).toMatchObject({ exists: 1, configured: true });
  });

  it("reports unconfigured when the row is missing", async () => {
    const r = await ops.getMailSetupExists(undefined, context(withValue(null)));
    expect(r).toMatchObject({ exists: 0, configured: false });
  });

  it("reports unconfigured on unparseable settings rather than throwing", async () => {
    const r = await ops.getMailSetupExists(undefined, context(withValue("not json")));
    expect(r).toMatchObject({ exists: 0, configured: false });
  });

  it("reports unconfigured when the host is missing", async () => {
    const r = await ops.getMailSetupExists(undefined, context(
      withValue(JSON.stringify({ from_address: "a@b.c" }))
    ));
    expect(r.configured).toBe(false);
  });
});

describe("roles without users", () => {
  it("returns only roles nobody is assigned to", async () => {
    const r = await ops.getRolesWithoutUsers(undefined, context({
      Role: many([
        { id: "r1", name: "Used", description: null },
        { id: "r2", name: "Orphan", description: "none" }
      ]),
      RoleUser: many([{ roleId: "r1" }])
    }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "r2", name: "Orphan" });
  });

  it("returns everything when no role is assigned", async () => {
    const r = await ops.getRolesWithoutUsers(undefined, context({
      Role: many([{ id: "r1", name: "A" }, { id: "r2", name: "B" }]),
      RoleUser: many([])
    }));
    expect(r).toHaveLength(2);
  });

  it("short-circuits when there are no roles", async () => {
    const RoleUser = many([]);
    const r = await ops.getRolesWithoutUsers(undefined, context({ Role: many([]), RoleUser }));
    expect(r).toEqual([]);
    expect(RoleUser.findMany).not.toHaveBeenCalled();
  });
});
