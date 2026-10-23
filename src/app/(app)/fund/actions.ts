"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { FormError, amount, date, failure, text, type FormState } from "@/lib/forms";
import { UnbalancedEntryError } from "@/lib/ledger/entry";
import { formatMoney } from "@/lib/money";

/**
 * Hand out Unallocated money. The rows are a parallel-array post
 * (envelopeId[i] with amount[i]); a blank amount is zero.
 *
 * With a plan chosen, this confirms that plan's next run. "Skip" confirms it
 * with nothing in it, so a missed payday can be passed over deliberately
 * rather than nagging forever.
 */
export async function fundEnvelopes(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const store = getStore();
    const planRaw = text(data, "planId");
    const planId = planRaw === "" ? null : Number(planRaw);
    const plan = planId === null ? null : store.findPlan(planId);
    if (planId !== null && !plan) throw new FormError("That plan no longer exists.");
    const skip = data.get("intent") === "skip";

    const ids = data.getAll("envelopeId").map(Number);
    const raws = data.getAll("amount").map((v) => String(v).trim());
    const amounts = skip
      ? []
      : raws.map((raw, i) => ({ envelopeId: ids[i]!, amount: raw === "" ? 0 : amount(raw) }));

    const total = amounts.reduce((sum, a) => sum + a.amount, 0);
    if (!skip && amounts.every((a) => a.amount === 0)) throw new FormError("Enter an amount for at least one envelope.");

    store.fund({ date: date(data, "date"), amounts, planId, createdBy: user.id });
    revalidatePath("/", "layout");

    if (skip) return { ok: `Skipped this run of ${plan!.name}.`, at: Date.now() };
    return {
      ok: `Funded ${formatMoney(total)}${plan ? ` from ${plan.name}` : ""}.`,
      at: Date.now(),
    };
  } catch (err) {
    return failure(err, [LedgerError, UnbalancedEntryError]);
  }
}
