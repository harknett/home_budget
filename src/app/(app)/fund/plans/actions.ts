"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import type { FundingPlanLine } from "@/lib/db/types";
import { FormError, amount, date, failure, requiredText, text, type FormState } from "@/lib/forms";
import { isCadenceUnit } from "@/lib/funding/schedule";

/**
 * Create or update a plan, schedule and lines together. The lines are a
 * parallel-array post: envelopeId[i], rule[i], amount[i]. A rule of "none"
 * leaves that envelope out of the plan.
 */
export async function savePlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    const store = getStore();
    const name = requiredText(data, "name", "Name the plan.");
    const startDate = date(data, "startDate");
    const every = Number(data.get("every"));
    if (!Number.isInteger(every) || every < 1 || every > 365) throw new FormError("Every how many? 1 or more.");
    const unit = text(data, "unit");
    if (!isCadenceUnit(unit)) throw new FormError("Pick days, weeks or months.");

    const ids = data.getAll("envelopeId").map(Number);
    const rules = data.getAll("rule").map(String);
    const raws = data.getAll("amount").map((v) => String(v).trim());
    const lines: FundingPlanLine[] = [];
    ids.forEach((envelopeId, i) => {
      const rule = rules[i];
      if (rule !== "fixed" && rule !== "top_up") return;
      const cents = raws[i] ? amount(raws[i]!) : 0;
      if (cents < 0) throw new FormError("Plan amounts cannot be negative.");
      if (rule === "fixed" && cents === 0) return;
      lines.push({ envelopeId, rule, amountCents: cents });
    });

    const idRaw = text(data, "id");
    store.transaction(() => {
      let planId: number;
      if (idRaw) {
        planId = Number(idRaw);
        store.updatePlan(planId, { name, startDate, every, unit, active: data.get("active") === "on" });
      } else {
        planId = store.createPlan({ name, startDate, every, unit });
      }
      store.setPlanLines(planId, lines);
    });
    revalidatePath("/", "layout");
  } catch (err) {
    return failure(err, [LedgerError]);
  }
  redirect("/fund/plans");
}

export async function deletePlan(data: FormData): Promise<void> {
  await requireUser();
  getStore().deletePlan(Number(data.get("id")));
  revalidatePath("/", "layout");
  redirect("/fund/plans");
}
