/**
 * Recurrence scheduling, kept pure so it can be tested without a database.
 *
 * Laravel stores the interval on recurring_types (weekly | monthly | yearly)
 * and advances from the last generated occurrence, falling back to the
 * invoice's issue date. This mirrors that.
 */

export type RecurringInterval = "weekly" | "monthly" | "yearly";

export const RECURRING_INTERVALS: RecurringInterval[] = ["weekly", "monthly", "yearly"];

export function isRecurringInterval(value: unknown): value is RecurringInterval {
  return typeof value === "string" && (RECURRING_INTERVALS as string[]).includes(value);
}

/** Laravel defaults to monthly when no recurring type is set. */
export function normalizeInterval(value: unknown): RecurringInterval {
  return isRecurringInterval(value) ? value : "monthly";
}

/**
 * The next occurrence after `from`.
 *
 * Month and year steps clamp to the end of the target month, so the 31st
 * recurring monthly lands on the 30th/28th rather than rolling into the
 * following month the way naive setMonth does.
 */
export function nextRecurringDate(from: Date, interval: RecurringInterval): Date {
  const next = new Date(from.getTime());

  if (interval === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  const step = interval === "yearly" ? 12 : 1;
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + step);
  const daysInTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(day, daysInTargetMonth));
  return next;
}

/**
 * Whether an occurrence is due, given when the last one was generated.
 * `lastGeneratedAt` is null before the first occurrence, in which case the
 * schedule runs from the invoice's issue date.
 */
export function isOccurrenceDue(
  issueDate: Date,
  lastGeneratedAt: Date | null,
  interval: RecurringInterval,
  now: Date
): boolean {
  const anchor = lastGeneratedAt ?? issueDate;
  return nextRecurringDate(anchor, interval).getTime() <= now.getTime();
}
