import { describe, expect, it } from "vitest";
import {
  isOccurrenceDue,
  isRecurringInterval,
  nextRecurringDate,
  normalizeInterval,
  RECURRING_INTERVALS
} from "../paysuite/invoices/recurrence";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("normalizeInterval", () => {
  it("passes through the supported intervals", () => {
    for (const interval of RECURRING_INTERVALS) {
      expect(normalizeInterval(interval)).toBe(interval);
    }
  });

  it("falls back to monthly, matching Laravel's default", () => {
    expect(normalizeInterval(undefined)).toBe("monthly");
    expect(normalizeInterval(null)).toBe("monthly");
    expect(normalizeInterval("")).toBe("monthly");
    expect(normalizeInterval("fortnightly")).toBe("monthly");
    expect(normalizeInterval(7)).toBe("monthly");
  });

  it("recognises only the three known intervals", () => {
    expect(isRecurringInterval("weekly")).toBe(true);
    expect(isRecurringInterval("daily")).toBe(false);
  });
});

describe("nextRecurringDate", () => {
  it("advances a week", () => {
    expect(iso(nextRecurringDate(utc(2026, 3, 10), "weekly"))).toBe("2026-03-17");
  });

  it("advances a week across a month boundary", () => {
    expect(iso(nextRecurringDate(utc(2026, 3, 28), "weekly"))).toBe("2026-04-04");
  });

  it("advances a month", () => {
    expect(iso(nextRecurringDate(utc(2026, 3, 10), "monthly"))).toBe("2026-04-10");
  });

  it("clamps the 31st to the end of a 30-day month instead of skipping it", () => {
    // Naive setMonth would roll 31 Mar -> 1 May and lose April entirely.
    expect(iso(nextRecurringDate(utc(2026, 3, 31), "monthly"))).toBe("2026-04-30");
  });

  it("clamps into February", () => {
    expect(iso(nextRecurringDate(utc(2026, 1, 31), "monthly"))).toBe("2026-02-28");
  });

  it("clamps into a leap February", () => {
    expect(iso(nextRecurringDate(utc(2028, 1, 31), "monthly"))).toBe("2028-02-29");
  });

  it("rolls the year over in December", () => {
    expect(iso(nextRecurringDate(utc(2026, 12, 15), "monthly"))).toBe("2027-01-15");
  });

  it("advances a year", () => {
    expect(iso(nextRecurringDate(utc(2026, 6, 5), "yearly"))).toBe("2027-06-05");
  });

  it("moves 29 Feb to 28 Feb in a non-leap year", () => {
    expect(iso(nextRecurringDate(utc(2028, 2, 29), "yearly"))).toBe("2029-02-28");
  });

  it("does not mutate the date it is given", () => {
    const from = utc(2026, 3, 10);
    nextRecurringDate(from, "monthly");
    expect(iso(from)).toBe("2026-03-10");
  });
});

describe("isOccurrenceDue", () => {
  const issue = utc(2026, 1, 10);

  it("is not due before the first interval has elapsed", () => {
    expect(isOccurrenceDue(issue, null, "monthly", utc(2026, 2, 9))).toBe(false);
  });

  it("is due exactly on the interval boundary", () => {
    expect(isOccurrenceDue(issue, null, "monthly", utc(2026, 2, 10))).toBe(true);
  });

  it("counts from the last generated occurrence, not the issue date", () => {
    const lastGenerated = utc(2026, 2, 10);
    // A month after issue, but only days after the last occurrence.
    expect(isOccurrenceDue(issue, lastGenerated, "monthly", utc(2026, 2, 20))).toBe(false);
    expect(isOccurrenceDue(issue, lastGenerated, "monthly", utc(2026, 3, 10))).toBe(true);
  });

  it("respects weekly and yearly spacing", () => {
    expect(isOccurrenceDue(issue, null, "weekly", utc(2026, 1, 16))).toBe(false);
    expect(isOccurrenceDue(issue, null, "weekly", utc(2026, 1, 17))).toBe(true);
    expect(isOccurrenceDue(issue, null, "yearly", utc(2026, 12, 31))).toBe(false);
    expect(isOccurrenceDue(issue, null, "yearly", utc(2027, 1, 10))).toBe(true);
  });
});
