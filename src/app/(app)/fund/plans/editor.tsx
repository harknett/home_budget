"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Field, Notice, inputClass, controlClass } from "@/components/ui";
import type { FundingPlan, PlanRule } from "@/lib/db/types";
import type { FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";

import { deletePlan, savePlan } from "./actions";

interface EnvelopeRow {
  id: number;
  name: string;
  group: string;
  targetCents: number | null;
}

type Choice = PlanRule | "none";

/**
 * One plan: its schedule, and for each envelope whether it gets a fixed
 * amount, a top-up to its target, or nothing. Every envelope is listed so a
 * plan is built by going down the list once.
 */
export function PlanEditor({
  plan,
  envelopes,
  today,
}: {
  plan: FundingPlan | null;
  envelopes: EnvelopeRow[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePlan, {});
  const existing = new Map(plan?.lines.map((l) => [l.envelopeId, l]));
  const [rules, setRules] = useState<Record<number, Choice>>(() =>
    Object.fromEntries(envelopes.map((e) => [e.id, existing.get(e.id)?.rule ?? "none"])),
  );
  return (
    <>
      <form action={action} className="space-y-3">
        {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Name" className="col-span-2 sm:col-span-1">
            <input name="name" defaultValue={plan?.name} required placeholder="Payday" className={inputClass} />
          </Field>
          <Field label="First run">
            <input name="startDate" type="date" defaultValue={plan?.startDate ?? today} required className={inputClass} />
          </Field>
          <Field label="Every">
            <div className="flex gap-1">
              <input
                name="every"
                type="number"
                min={1}
                max={365}
                defaultValue={plan?.every ?? 1}
                className={`${controlClass} h-10 w-16`}
              />
              <select name="unit" defaultValue={plan?.unit ?? "month"} className={inputClass}>
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
              </select>
            </div>
          </Field>
          {plan ? (
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={plan.active} className="size-4" />
              Active
            </label>
          ) : null}
        </div>
        {plan ? (
          <p className="text-xs opacity-60">Changing the first run or the interval restarts the schedule from that date.</p>
        ) : null}

        <div>
          <div className="flex border-b border-rule px-1 pb-0.5 text-xs font-semibold uppercase tracking-wide opacity-70 dark:border-white/15">
            <span className="flex-1">Envelope</span>
            <span className="w-28">Rule</span>
            <span className="num w-28">Amount</span>
          </div>
          {envelopes.map((e, i) => {
            const header = i === 0 || envelopes[i - 1]!.group !== e.group ? e.group : null;
            const rule = rules[e.id] ?? "none";
            const line = existing.get(e.id);
            return (
              <div key={e.id}>
                {header ? <div className="px-1 pt-2 text-[11px] font-semibold uppercase opacity-50">{header}</div> : null}
                <div className="flex min-h-10 items-center gap-1 border-b border-rule px-1 text-sm dark:border-white/10">
                  <input type="hidden" name="envelopeId" value={e.id} />
                  <span className="min-w-0 flex-1 truncate">
                    {e.name}
                    {e.targetCents !== null ? (
                      <span className="ml-1 text-[11px] opacity-50">target {formatMoney(e.targetCents)}</span>
                    ) : null}
                  </span>
                  <select
                    name="rule"
                    value={rule}
                    onChange={(ev) => setRules((r) => ({ ...r, [e.id]: ev.target.value as Choice }))}
                    className={`${controlClass} h-8 w-28 text-sm`}
                    aria-label={`Rule for ${e.name}`}
                  >
                    <option value="none">—</option>
                    <option value="fixed">Fixed</option>
                    <option value="top_up" disabled={e.targetCents === null}>
                      Top up
                    </option>
                  </select>
                  <input
                    name="amount"
                    inputMode="decimal"
                    // Read-only rather than disabled: a disabled input is left
                    // out of the post, which would misalign the row arrays.
                    readOnly={rule === "none"}
                    tabIndex={rule === "none" ? -1 : undefined}
                    defaultValue={line && line.amountCents > 0 ? formatMoney(line.amountCents) : ""}
                    placeholder={rule === "top_up" ? "no cap" : "0.00"}
                    className={`${controlClass} num w-28 h-8 read-only:opacity-30`}
                    aria-label={`Amount for ${e.name}`}
                  />
                </div>
              </div>
            );
          })}
          <p className="mt-1 text-xs opacity-60">
            Top up fills the envelope to its target and stops there; an amount caps how much it adds per run.
          </p>
        </div>

        <Notice kind="error">{state.error}</Notice>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            Save plan
          </Button>
          <Link href="/fund/plans" className="inline-flex h-10 items-center px-3 text-sm underline opacity-70">
            Cancel
          </Link>
        </div>
      </form>

      {plan ? (
        <form action={deletePlan} className="mt-6">
          <input type="hidden" name="id" value={plan.id} />
          <button className="text-xs underline opacity-60">Delete plan (funding it already did stays)</button>
        </form>
      ) : null}
    </>
  );
}
