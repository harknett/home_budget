import type { FundingPlan } from "@/lib/db/types";

import { occurrence, runsDue } from "./schedule";

export interface PlanStatus {
  plan: FundingPlan;
  /** Runs due on or before today. More than one means runs were missed. */
  due: number;
  /** The date of the next run to be confirmed. */
  nextDate: string;
}

/** Where each active plan stands today, due ones first. */
export function planStatuses(plans: FundingPlan[], today: string): PlanStatus[] {
  return plans
    .filter((p) => p.active)
    .map((plan) => ({
      plan,
      due: runsDue(plan, plan.runs, today),
      nextDate: occurrence(plan, plan.runs),
    }))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
