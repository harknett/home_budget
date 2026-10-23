"use client";

import { useActionState, useState } from "react";

import { Button, Notice, controlClass } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";

import { postMove } from "./add/actions";

/**
 * Move money into or out of one envelope, from inside its row. The common
 * case — "Groceries is short, take it from Dining" — in one line.
 */
export function QuickMove({
  envelopeId,
  envelopes,
  today,
}: {
  envelopeId: number;
  envelopes: { id: number; name: string; balance: number }[];
  today: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(postMove, {});
  const [direction, setDirection] = useState<"in" | "out">("in");
  const others = envelopes.filter((e) => e.id !== envelopeId);

  return (
    <form key={state.at} action={action} className="space-y-1.5">
      <input type="hidden" name="date" value={today} />
      {direction === "in" ? (
        <input type="hidden" name="toEnvelopeId" value={envelopeId} />
      ) : (
        <input type="hidden" name="fromEnvelopeId" value={envelopeId} />
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "in" | "out")}
          className={`${controlClass} h-10 w-20 shrink-0`}
          aria-label="Direction"
        >
          <option value="in">From</option>
          <option value="out">To</option>
        </select>
        <select
          name={direction === "in" ? "fromEnvelopeId" : "toEnvelopeId"}
          className={`${controlClass} h-10 min-w-0 flex-1`}
          aria-label="Other envelope"
        >
          {others.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({formatMoney(e.balance)})
            </option>
          ))}
        </select>
        <input name="amount" inputMode="decimal" placeholder="0.00" required className={`${controlClass} num h-10 w-24 shrink-0`} aria-label="Amount" />
        <Button size="field" type="submit" disabled={pending} className="shrink-0">
          Move
        </Button>
      </div>
      <Notice kind="error">{state.error}</Notice>
    </form>
  );
}
