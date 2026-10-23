"use client";

import { useActionState, useState } from "react";

import { Button, Money, Notice, controlClass } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import type { FormState } from "@/lib/forms";
import { MoneyParseError, formatMoney, parseMoney } from "@/lib/money";

import { fundEnvelopes } from "./actions";

interface PlanOption {
  id: number;
  name: string;
  cadence: string;
  due: number;
  nextDate: string;
  /** Envelope id → proposed cents. */
  proposal: Record<string, number>;
}

interface GroupRows {
  id: number;
  name: string;
  envelopes: { id: number; name: string; balance: number; targetCents: number | null }[];
}

/** Cents typed so far, or null while a box holds something unreadable. */
function cents(raw: string | undefined): number | null {
  if (!raw || raw.trim() === "") return 0;
  try {
    return parseMoney(raw);
  } catch (err) {
    if (err instanceof MoneyParseError) return null;
    throw err;
  }
}

function fill(proposal: Record<string, number> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(proposal ?? {}).map(([id, c]) => [id, formatMoney(c)]));
}

export function FundForm({
  today,
  unallocated,
  plans,
  groups,
}: {
  today: string;
  unallocated: number;
  plans: PlanOption[];
  groups: GroupRows[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(fundEnvelopes, {});
  // The first plan that is due, if any: that is almost always why you came.
  const firstDue = plans.find((p) => p.due > 0);
  const [planId, setPlanId] = useState<number | null>(firstDue?.id ?? null);
  const plan = plans.find((p) => p.id === planId);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => fill(plan?.proposal));

  // After a save the page's numbers are fresh, so start over from them.
  const [savedAt, setSavedAt] = useState(state.at);
  if (state.at !== savedAt) {
    setSavedAt(state.at);
    const next = plans.find((p) => p.due > 0);
    setPlanId(next?.id ?? null);
    setAmounts(fill(next?.proposal));
  }

  function choosePlan(id: number | null) {
    setPlanId(id);
    setAmounts(fill(plans.find((p) => p.id === id)?.proposal));
  }

  const parsed = Object.values(amounts).map(cents);
  const unreadable = parsed.some((c) => c === null);
  const total = parsed.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  const left = unallocated - total;

  return (
    <form action={action}>
      <input type="hidden" name="planId" value={planId ?? ""} />

      {/* The running answer to "how much is left to give out". */}
      <div className="sticky top-0 z-10 -mx-3 mb-3 border-b border-rule bg-paper/95 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-ink/95">
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-70">Unallocated</span>
          <Money cents={unallocated} />
          <span className="opacity-50">→</span>
          <Money cents={left} className="font-semibold" />
          <span className="text-xs opacity-60">left</span>
          <input type="date" name="date" defaultValue={today} className={`${controlClass} ml-auto h-8 w-36 text-xs`} aria-label="Date" />
        </div>
        {left < 0 ? (
          <p className="mt-1 text-xs text-short">That is {formatMoney(-left)} more than is unallocated.</p>
        ) : null}
      </div>

      <fieldset className="mb-3">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">Plan</legend>
        <div className="flex flex-wrap gap-1">
          <PlanChip active={planId === null} onClick={() => choosePlan(null)}>
            No plan
          </PlanChip>
          {plans.map((p) => (
            <PlanChip key={p.id} active={planId === p.id} onClick={() => choosePlan(p.id)}>
              {p.name}
              <span className={`ml-1 text-[11px] ${p.due > 0 ? "font-semibold text-warn" : "opacity-60"}`}>
                {p.due > 1 ? `${p.due} due` : p.due === 1 ? "due" : shortDate(p.nextDate)}
              </span>
            </PlanChip>
          ))}
        </div>
        {plan ? (
          <p className="mt-1 text-xs opacity-60">
            {plan.cadence}. Funding confirms the run for {shortDate(plan.nextDate)}
            {plan.due === 0 ? " — early" : ""}. Change any amount; the plan is a suggestion.
          </p>
        ) : null}
      </fieldset>

      {groups.map((g) =>
        g.envelopes.length === 0 ? null : (
          <section key={g.id} className="mb-3">
            <div className="flex border-b border-rule px-1 pb-0.5 text-xs font-semibold uppercase tracking-wide opacity-70 dark:border-white/15">
              <span className="flex-1">{g.name}</span>
              <span className="num w-20">Balance</span>
              <span className="num w-16">{plan ? "Plan" : ""}</span>
              <span className="num w-24">Fund</span>
            </div>
            {g.envelopes.map((e) => {
              const proposed = plan?.proposal[e.id];
              const typed = cents(amounts[e.id]);
              const after = e.balance + (typed ?? 0);
              const short = e.targetCents !== null && after < e.targetCents;
              return (
                <div key={e.id} className="flex min-h-10 items-center gap-1 border-b border-rule px-1 text-sm dark:border-white/10">
                  <input type="hidden" name="envelopeId" value={e.id} />
                  <span className="min-w-0 flex-1 truncate">
                    {e.name}
                    {short ? (
                      <span className="ml-1 text-[11px] text-warn">−{formatMoney(e.targetCents! - after)}</span>
                    ) : null}
                  </span>
                  <Money cents={e.balance} className="w-20 text-xs opacity-70" />
                  <span className="w-16 text-right">
                    {proposed ? (
                      <button
                        type="button"
                        onClick={() => setAmounts((a) => ({ ...a, [e.id]: formatMoney(proposed) }))}
                        className="num text-xs underline opacity-70"
                        title="Use the plan's amount"
                      >
                        {formatMoney(proposed)}
                      </button>
                    ) : null}
                  </span>
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amounts[e.id] ?? ""}
                    onChange={(ev) => setAmounts((a) => ({ ...a, [e.id]: ev.target.value }))}
                    className={`${controlClass} num h-8 w-24 ${cents(amounts[e.id]) === null ? "border-short" : ""}`}
                    aria-label={`Fund ${e.name}`}
                  />
                </div>
              );
            })}
          </section>
        ),
      )}

      <Notice kind="error">{state.error}</Notice>
      <Notice kind="ok">{state.ok}</Notice>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || unreadable || left < 0 || total === 0}>
          Fund {formatMoney(total)}
        </Button>
        {plan ? (
          <Button type="button" variant="quiet" onClick={() => choosePlan(plan.id)}>
            Reset to plan
          </Button>
        ) : null}
        <Button type="button" variant="quiet" onClick={() => setAmounts({})}>
          Clear
        </Button>
        {plan ? (
          <Button type="submit" name="intent" value="skip" variant="quiet" disabled={pending} className="ml-auto">
            Skip this run
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function PlanChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded border px-2 py-1 text-sm ${
        active ? "border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink" : "border-black/15 dark:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
