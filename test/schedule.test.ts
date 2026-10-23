import { describe, expect, it } from "vitest";

import { addMonths, isValidDate, today } from "@/lib/dates";
import { proposeAmounts } from "@/lib/funding/proposal";
import { describeCadence, occurrence, runsDue } from "@/lib/funding/schedule";

describe("dates", () => {
  it("adds months holding the day, clamping at month end", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("knows a real date from a plausible-looking one", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("26-02-01")).toBe(false);
  });

  it("asks the household's zone what day it is, not the server's", () => {
    // 02:00 UTC on the 24th is still the 23rd in New York.
    const instant = new Date("2026-10-24T02:00:00Z");
    expect(today("America/New_York", instant)).toBe("2026-10-23");
    expect(today("UTC", instant)).toBe("2026-10-24");
  });
});

describe("funding schedules", () => {
  it("counts runs from the start, so month-end anchors never drift", () => {
    const monthly = { startDate: "2026-01-31", every: 1, unit: "month" as const };
    expect(occurrence(monthly, 1)).toBe("2026-02-28");
    // Chained from Feb 28 this would be Mar 28. Counted from the start it is
    // the 31st again.
    expect(occurrence(monthly, 2)).toBe("2026-03-31");
  });

  it("steps by days and weeks", () => {
    const fortnightly = { startDate: "2026-10-02", every: 2, unit: "week" as const };
    expect(occurrence(fortnightly, 0)).toBe("2026-10-02");
    expect(occurrence(fortnightly, 1)).toBe("2026-10-16");
    expect(occurrence({ startDate: "2026-10-02", every: 10, unit: "day" }, 1)).toBe("2026-10-12");
  });

  it("reports every missed run, not just the latest", () => {
    const weekly = { startDate: "2026-10-01", every: 1, unit: "week" as const };
    expect(runsDue(weekly, 0, "2026-09-30")).toBe(0);
    expect(runsDue(weekly, 0, "2026-10-01")).toBe(1);
    expect(runsDue(weekly, 0, "2026-10-15")).toBe(3);
    expect(runsDue(weekly, 3, "2026-10-15")).toBe(0);
  });

  it("reads naturally", () => {
    expect(describeCadence({ every: 1, unit: "month" })).toBe("Monthly");
    expect(describeCadence({ every: 2, unit: "week" })).toBe("Every 2 weeks");
  });
});

describe("plan proposals", () => {
  const envelopes = new Map([
    [1, { balance: 5000, targetCents: 20000 }],
    [2, { balance: 25000, targetCents: 20000 }],
    [3, { balance: 0, targetCents: null }],
  ]);

  it("adds a fixed amount whatever the balance", () => {
    const out = proposeAmounts([{ envelopeId: 2, rule: "fixed", amountCents: 1000 }], envelopes);
    expect(out.get(2)).toBe(1000);
  });

  it("tops up to the target and never past it", () => {
    const out = proposeAmounts(
      [
        { envelopeId: 1, rule: "top_up", amountCents: 0 },
        { envelopeId: 2, rule: "top_up", amountCents: 0 },
        { envelopeId: 3, rule: "top_up", amountCents: 0 },
      ],
      envelopes,
    );
    expect(out.get(1)).toBe(15000);
    // Already over target, and no target at all: nothing proposed.
    expect(out.has(2)).toBe(false);
    expect(out.has(3)).toBe(false);
  });

  it("caps a top-up at the line's amount when one is set", () => {
    const out = proposeAmounts([{ envelopeId: 1, rule: "top_up", amountCents: 4000 }], envelopes);
    expect(out.get(1)).toBe(4000);
  });
});
