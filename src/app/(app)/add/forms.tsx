"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Field, Notice, amountClass, inputClass } from "@/components/ui";
import type { FormState } from "@/lib/forms";
import { formatMoney } from "@/lib/money";

import { postExpense, postIncome, postMove, postTransfer } from "./actions";

export type Kind = "expense" | "income" | "transfer" | "move";

interface AccountOption {
  id: number;
  name: string;
  onBudget: boolean;
  balance: number;
}

interface EnvelopeOption {
  id: number;
  name: string;
  group: string;
  balance: number;
  isUnallocated: boolean;
}

interface Props {
  initialKind: Kind;
  today: string;
  accounts: AccountOption[];
  envelopes: EnvelopeOption[];
  envelopeId: number | null;
  accountId: number | null;
}

const TABS: { kind: Kind; label: string }[] = [
  { kind: "expense", label: "Spend" },
  { kind: "income", label: "Income" },
  { kind: "transfer", label: "Transfer" },
  { kind: "move", label: "Move" },
];

export function AddForms(props: Props) {
  const [kind, setKind] = useState<Kind>(props.initialKind);

  if (props.accounts.length === 0 && kind !== "move") {
    return (
      <p className="text-sm opacity-70">
        Add an account first, on <Link className="underline" href="/accounts">Accounts</Link>.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex gap-1" role="tablist">
        {TABS.map((t) => (
          <Button
            key={t.kind}
            size="sm"
            role="tab"
            aria-selected={kind === t.kind}
            variant={kind === t.kind ? "primary" : "quiet"}
            onClick={() => setKind(t.kind)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {kind === "expense" ? <ExpenseForm {...props} /> : null}
      {kind === "income" ? <IncomeForm {...props} /> : null}
      {kind === "transfer" ? <TransferForm {...props} /> : null}
      {kind === "move" ? <MoveForm {...props} /> : null}
    </>
  );
}

function AccountSelect({
  name,
  accounts,
  defaultValue,
  label,
  onChange,
}: {
  name: string;
  accounts: AccountOption[];
  defaultValue?: number | null;
  label: string;
  onChange?: (id: number) => void;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={defaultValue ?? accounts[0]?.id}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className={inputClass}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({formatMoney(a.balance)})
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Envelopes grouped as on the main screen, with each balance in the label. */
function EnvelopeOptions({ envelopes }: { envelopes: EnvelopeOption[] }) {
  const groups = new Map<string, EnvelopeOption[]>();
  for (const e of envelopes) {
    const key = e.isUnallocated ? "" : e.group;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return (
    <>
      {[...groups].map(([group, list]) =>
        group === "" ? (
          list.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({formatMoney(e.balance)})
            </option>
          ))
        ) : (
          <optgroup key={group} label={group}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({formatMoney(e.balance)})
              </option>
            ))}
          </optgroup>
        ),
      )}
    </>
  );
}

function Common({ today, payeeLabel = "Payee" }: { today: string; payeeLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Date">
        <input name="date" type="date" defaultValue={today} required className={inputClass} />
      </Field>
      <Field label={payeeLabel}>
        <input name="payee" className={inputClass} autoComplete="off" />
      </Field>
    </div>
  );
}

function Footer({ state, pending, label }: { state: FormState; pending: boolean; label: string }) {
  return (
    <>
      <Field label="Memo">
        <input name="memo" className={inputClass} autoComplete="off" />
      </Field>
      <Notice kind="error">{state.error}</Notice>
      <Notice kind="ok">{state.ok}</Notice>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : label}
      </Button>
    </>
  );
}

/**
 * Spending, with as many envelope splits as it needs. The form resets after
 * a save (its key changes), ready for the next receipt.
 */
function ExpenseForm({ today, accounts, envelopes, envelopeId, accountId }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(postExpense, {});
  const [splits, setSplits] = useState(1);
  // A saved receipt starts the next one from a single row again.
  const [seen, setSeen] = useState(state.at);
  if (state.at !== seen) {
    setSeen(state.at);
    setSplits(1);
  }
  const spendable = envelopes.filter((e) => !e.isUnallocated);
  const onBudget = accounts.filter((a) => a.onBudget);

  if (spendable.length === 0) {
    return (
      <p className="text-sm opacity-70">
        Make some envelopes first, under <Link className="underline" href="/envelopes">More → Envelopes</Link>.
      </p>
    );
  }

  return (
    <form key={state.at} action={action} className="space-y-3">
      <Common today={today} />
      <AccountSelect name="accountId" label="Paid from" accounts={onBudget} defaultValue={accountId} />
      <div className="space-y-2">
        {Array.from({ length: splits }, (_, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={i === 0 ? "Envelope" : "Split"} className="min-w-0 flex-1">
              <select
                name="envelopeId"
                defaultValue={i === 0 ? (envelopeId ?? spendable[0]!.id) : spendable[0]!.id}
                className={inputClass}
              >
                <EnvelopeOptions envelopes={spendable} />
              </select>
            </Field>
            <Field label="Amount">
              <input
                name="amount"
                inputMode="decimal"
                required={i === 0}
                autoFocus={i === 0}
                placeholder="0.00"
                className={amountClass}
              />
            </Field>
          </div>
        ))}
        <button type="button" onClick={() => setSplits((n) => n + 1)} className="text-xs underline opacity-70">
          + Split across another envelope
        </button>
        <p className="text-xs opacity-60">A refund is a negative amount; it goes back in the envelope.</p>
      </div>
      <Footer state={state} pending={pending} label="Save" />
    </form>
  );
}

function IncomeForm({ today, accounts, accountId }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(postIncome, {});
  return (
    <form key={state.at} action={action} className="space-y-3">
      <Common today={today} payeeLabel="From" />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <AccountSelect
            name="accountId"
            label="Into"
            accounts={accounts.filter((a) => a.onBudget)}
            defaultValue={accountId}
          />
        </div>
        <Field label="Amount">
          <input name="amount" inputMode="decimal" required autoFocus placeholder="0.00" className={amountClass} />
        </Field>
      </div>
      <p className="text-xs opacity-60">Income lands in Unallocated. Hand it out on Fund.</p>
      <Footer state={state} pending={pending} label="Save" />
    </form>
  );
}

/**
 * Between accounts. Paying an off-budget account (a loan) spends from an
 * envelope, so the envelope picker appears only when it is needed.
 */
function TransferForm({ today, accounts, envelopes, accountId }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(postTransfer, {});
  const [fromId, setFromId] = useState(accountId ?? accounts[0]?.id);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== fromId)?.id);
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const leavesBudget = Boolean(from?.onBudget && to && !to.onBudget);

  return (
    <form key={state.at} action={action} className="space-y-3">
      <Common today={today} payeeLabel="Description" />
      <div className="grid grid-cols-2 gap-2">
        <AccountSelect name="fromAccountId" label="From" accounts={accounts} defaultValue={fromId} onChange={setFromId} />
        <AccountSelect name="toAccountId" label="To" accounts={accounts} defaultValue={toId} onChange={setToId} />
      </div>
      {leavesBudget ? (
        <Field label="Paid from envelope" hint={`${to!.name} is off-budget, so this money leaves the budget.`}>
          <select name="envelopeId" className={inputClass}>
            <EnvelopeOptions envelopes={envelopes} />
          </select>
        </Field>
      ) : null}
      <Field label="Amount">
        <input name="amount" inputMode="decimal" required placeholder="0.00" className={amountClass} />
      </Field>
      <p className="text-xs opacity-60">
        Paying a credit card is a transfer: the spending was already taken from envelopes when it went on the card.
      </p>
      <Footer state={state} pending={pending} label="Transfer" />
    </form>
  );
}

function MoveForm({ today, envelopes, envelopeId }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(postMove, {});
  return (
    <form key={state.at} action={action} className="space-y-3">
      <Field label="Date">
        <input name="date" type="date" defaultValue={today} required className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From envelope">
          <select name="fromEnvelopeId" defaultValue={envelopeId ?? envelopes[0]?.id} className={inputClass}>
            <EnvelopeOptions envelopes={envelopes} />
          </select>
        </Field>
        <Field label="To envelope">
          <select name="toEnvelopeId" defaultValue={envelopes.find((e) => e.id !== envelopeId && !e.isUnallocated)?.id} className={inputClass}>
            <EnvelopeOptions envelopes={envelopes} />
          </select>
        </Field>
      </div>
      <Field label="Amount">
        <input name="amount" inputMode="decimal" required placeholder="0.00" className={amountClass} />
      </Field>
      <Footer state={state} pending={pending} label="Move" />
    </form>
  );
}
