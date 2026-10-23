/**
 * Dates as `YYYY-MM-DD` calendar strings.
 *
 * A transaction happens on a calendar day, not at an instant, and SQLite sorts
 * and ranges these strings correctly as text. Two rules keep the server's own
 * clock zone out of it:
 *
 *   - **Today is asked of the household's zone.** The host runs in UTC; a
 *     purchase at 9pm in New York belongs to that day, not tomorrow.
 *   - **Arithmetic is pure calendar**, done in UTC where there is no daylight
 *     saving, so the answer cannot depend on where the code runs.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parts(date: string): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}

function utc(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  return fromUtc(utc(value)) === value;
}

/** The date it is now in a time zone. `now` is there so tests can pin it. */
export function today(timeZone: string, now: Date = new Date()): string {
  const bits = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => bits.find((b) => b.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: string, days: number): string {
  const at = utc(date);
  at.setUTCDate(at.getUTCDate() + days);
  return fromUtc(at);
}

/**
 * Add calendar months, holding the day of the month where it can and
 * clamping where it cannot: Jan 31 + 1 month is Feb 28 (or 29).
 *
 * Always counted from the date given, never chained. Chaining would drift a
 * plan anchored on the 31st down to the 28th for good after one February.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(year, month, Math.min(d, last))));
}

/** The first of the month a date sits in. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** "Sep 21" - short enough for a phone row. */
export function shortDate(date: string): string {
  return utc(date).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}
