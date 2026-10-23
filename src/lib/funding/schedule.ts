import { addDays, addMonths } from "@/lib/dates";

/**
 * When a funding plan comes due.
 *
 * A plan runs every N days, weeks or months from its start date. Occurrences
 * are counted from the start, never chained from the last one: the k-th run
 * is `start + k × interval`. That keeps a plan anchored on the 31st on the
 * 31st (or the month's last day) forever, instead of sliding to the 28th
 * after its first February.
 *
 * A plan stores how many runs it has had. The next one is due on occurrence
 * number `runs`. Nothing is funded automatically — a due plan is a proposal on
 * the Fund screen until somebody confirms it.
 */

export const CADENCE_UNITS = ["day", "week", "month"] as const;
export type CadenceUnit = (typeof CADENCE_UNITS)[number];

export function isCadenceUnit(value: unknown): value is CadenceUnit {
  return typeof value === "string" && (CADENCE_UNITS as readonly string[]).includes(value);
}

export interface Cadence {
  startDate: string;
  every: number;
  unit: CadenceUnit;
}

/** The date of run number `index`, counting the start as run 0. */
export function occurrence(cadence: Cadence, index: number): string {
  const steps = cadence.every * index;
  switch (cadence.unit) {
    case "day":
      return addDays(cadence.startDate, steps);
    case "week":
      return addDays(cadence.startDate, steps * 7);
    case "month":
      return addMonths(cadence.startDate, steps);
  }
}

/**
 * How many runs are due on or before `today`, given the plan has had `runs`.
 *
 * More than one means paydays were missed. Each confirmation on the Fund
 * screen takes one, so a missed run is never silently skipped or doubled.
 */
export function runsDue(cadence: Cadence, runs: number, today: string): number {
  let due = 0;
  // Bounded: a daily plan left alone for years should not spin the server.
  while (due < 1000 && occurrence(cadence, runs + due) <= today) due++;
  return due;
}

/** "Every 2 weeks", "Monthly" — for the plan list. */
export function describeCadence(cadence: Pick<Cadence, "every" | "unit">): string {
  if (cadence.every === 1) {
    return { day: "Daily", week: "Weekly", month: "Monthly" }[cadence.unit];
  }
  return `Every ${cadence.every} ${cadence.unit}s`;
}
