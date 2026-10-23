"use client";

import { useActionState, useState } from "react";

import { Button, Field, Notice, amountClass, inputClass, controlClass } from "@/components/ui";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, type AccountKind } from "@/lib/db/types";
import type { FormState } from "@/lib/forms";

import { closeAccount, createAccount, renameAccount } from "./actions";

export function NewAccount({ today }: { today: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAccount, {});
  const [kind, setKind] = useState<AccountKind>("checking");
  const owed = kind === "credit_card" || kind === "loan";

  return (
    <details open={false} className="rounded border border-black/15 p-2 dark:border-white/15">
      <summary className="cursor-pointer text-sm font-medium">Add an account</summary>
      <form key={state.at} action={action} className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name">
            <input name="name" required placeholder="Joint checking" className={inputClass} />
          </Field>
          <Field label="Kind">
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
              className={inputClass}
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={owed ? "Amount owed" : "Current balance"}>
            <input name="balance" inputMode="decimal" placeholder="0.00" className={amountClass} />
          </Field>
          <Field label="As of">
            <input name="date" type="date" defaultValue={today} required className={inputClass} />
          </Field>
        </div>
        <p className="text-xs opacity-60">
          {kind === "loan"
            ? "Loans are tracked off-budget: a balance only. Payments to it come out of an envelope."
            : owed
              ? "What is already owed comes out of Unallocated, so the debt is in the budget from day one."
              : "The balance lands in Unallocated, ready to fund envelopes."}
        </p>
        <Notice kind="error">{state.error}</Notice>
        <Notice kind="ok">{state.ok}</Notice>
        <Button size="sm" type="submit" disabled={pending}>
          Add account
        </Button>
      </form>
    </details>
  );
}

export function AccountSettings({ id, name }: { id: number; name: string }) {
  const [renamed, rename] = useActionState<FormState, FormData>(renameAccount, {});
  const [closed, close] = useActionState<FormState, FormData>(closeAccount, {});
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer opacity-60">Account settings</summary>
      <div className="mt-2 space-y-2">
        <form action={rename} className="flex gap-1.5">
          <input type="hidden" name="id" value={id} />
          <input name="name" defaultValue={name} required className={`${controlClass} h-10 min-w-0 flex-1`} aria-label="Name" />
          <Button size="field" type="submit">
            Rename
          </Button>
        </form>
        <form action={close}>
          <input type="hidden" name="id" value={id} />
          <Button size="sm" variant="quiet" type="submit">
            Close account
          </Button>
          <span className="ml-2 text-xs opacity-60">Only at a zero balance. History is kept.</span>
        </form>
        <Notice kind="error">{renamed.error ?? closed.error}</Notice>
      </div>
    </details>
  );
}
