import { describe, expect, it } from "vitest";
import {
  isOccurrenceDue,
  nextRecurringDate,
  normalizeInterval
} from "../paysuite/invoices/recurrence";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("recurring interval", () => {
  it("defaults to monthly, matching Laravel's fallback", () => {
    expect(normalizeInterval(undefined)).toBe("monthly");
    expect(normalizeInterval(null)).toBe("monthly");
    expect(normalizeInterval("fortnightly")).toBe("monthly");
    expect(normalizeInterval("weekly")).toBe("weekly");
    expect(normalizeInterval("yearly")).toBe("yearly");
  });

  it("advances weekly, monthly and yearly", () => {
    expect(nextRecurringDate(utc(2026, 3, 10), "weekly")).toEqual(utc(2026, 3, 17));
    expect(nextRecurringDate(utc(2026, 3, 10), "monthly")).toEqual(utc(2026, 4, 10));
    expect(nextRecurringDate(utc(2026, 3, 10), "yearly")).toEqual(utc(2027, 3, 10));
  });

  it("clamps to the end of a shorter month instead of overflowing", () => {
    // Naive setMonth on 31 Jan gives 3 March. It must land on 28 Feb.
    expect(nextRecurringDate(utc(2026, 1, 31), "monthly")).toEqual(utc(2026, 2, 28));
    expect(nextRecurringDate(utc(2026, 3, 31), "monthly")).toEqual(utc(2026, 4, 30));
  });

  it("handles a leap year February", () => {
    expect(nextRecurringDate(utc(2028, 1, 31), "monthly")).toEqual(utc(2028, 2, 29));
    expect(nextRecurringDate(utc(2028, 2, 29), "yearly")).toEqual(utc(2029, 2, 28));
  });

  it("crosses the year boundary", () => {
    expect(nextRecurringDate(utc(2026, 12, 15), "monthly")).toEqual(utc(2027, 1, 15));
    expect(nextRecurringDate(utc(2026, 12, 29), "weekly")).toEqual(utc(2027, 1, 5));
  });
});

describe("occurrence scheduling", () => {
  it("schedules the first occurrence from the issue date", () => {
    const issued = utc(2026, 3, 1);
    expect(isOccurrenceDue(issued, null, "monthly", utc(2026, 3, 31))).toBe(false);
    expect(isOccurrenceDue(issued, null, "monthly", utc(2026, 4, 1))).toBe(true);
  });

  it("schedules later occurrences from the previous one, not the issue date", () => {
    const issued = utc(2026, 1, 1);
    const lastGenerated = utc(2026, 5, 1);
    // Long past the issue date, but only one month after the last occurrence.
    expect(isOccurrenceDue(issued, lastGenerated, "monthly", utc(2026, 5, 20))).toBe(false);
    expect(isOccurrenceDue(issued, lastGenerated, "monthly", utc(2026, 6, 1))).toBe(true);
  });

  it("respects a weekly cadence", () => {
    const issued = utc(2026, 3, 2);
    expect(isOccurrenceDue(issued, null, "weekly", utc(2026, 3, 8))).toBe(false);
    expect(isOccurrenceDue(issued, null, "weekly", utc(2026, 3, 9))).toBe(true);
  });

  it("does not fire a yearly series within the year", () => {
    const issued = utc(2026, 6, 1);
    expect(isOccurrenceDue(issued, null, "yearly", utc(2027, 5, 31))).toBe(false);
    expect(isOccurrenceDue(issued, null, "yearly", utc(2027, 6, 1))).toBe(true);
  });
});
