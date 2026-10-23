"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { FormError, amount, date, failure, id, money, text, type FormState } from "@/lib/forms";
import { UnbalancedEntryError, expense, income, move, transfer } from "@/lib/ledger/entry";
import { formatMoney } from "@/lib/money";

const KNOWN = [LedgerError, UnbalancedEntryError];

function refresh() {
  revalidatePath("/", "layout");
}

/**
 * Spending, split across one or more envelopes. The split rows are a
 * parallel-array post: envelope[i] goes with amount[i]; blank rows are the
 * spares at the bottom.
 */
export async function postExpense(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const store = getStore();
    const accountId = id(data, "accountId", "Pick the account it was paid from.");
    const account = store.findAccount(accountId);
    if (!account) throw new FormError("Pick the account it was paid from.");
    if (!account.onBudget) {
      throw new FormError(`${account.name} is off-budget. Record a payment to it as a transfer.`);
    }

    const envelopes = data.getAll("envelopeId").map(Number);
    const amounts = data.getAll("amount").map((v) => String(v).trim());
    const splits: { envelopeId: number; amount: number }[] = [];
    amounts.forEach((raw, i) => {
      if (raw === "") return;
      const cents = amount(raw);
      const envelopeId = envelopes[i];
      if (!envelopeId) throw new FormError("Every amount needs an envelope.");
      splits.push({ envelopeId, amount: cents });
    });
    if (splits.length === 0) throw new FormError("Enter an amount.");

    // A refund is entered as a negative amount and puts money back.
    const total = splits.reduce((sum, s) => sum + s.amount, 0);
    store.postEntry(
      expense({ date: date(data, "date"), accountId, payee: text(data, "payee"), memo: text(data, "memo"), splits }),
      user.id,
    );
    refresh();
    return { ok: `${total < 0 ? "Refund" : "Spent"} ${formatMoney(Math.abs(total))} from ${account.name}.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function postIncome(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const store = getStore();
    const accountId = id(data, "accountId", "Pick the account it went into.");
    const account = store.findAccount(accountId);
    if (!account?.onBudget) throw new FormError("Income goes into an on-budget account.");
    const amount = money(data, "amount", { positive: true });
    store.postEntry(
      income({
        date: date(data, "date"),
        accountId,
        amount,
        unallocatedId: store.unallocatedId(),
        payee: text(data, "payee"),
        memo: text(data, "memo"),
      }),
      user.id,
    );
    refresh();
    return { ok: `${formatMoney(amount)} in. It is in Unallocated until you fund it.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

/**
 * Money between accounts. When it crosses the budget's edge — paying a loan
 * from checking, or a loan advance landing in checking — an envelope takes
 * the other side; between two on-budget accounts none does.
 */
export async function postTransfer(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const store = getStore();
    const from = store.findAccount(id(data, "fromAccountId", "Pick where it came from."));
    const to = store.findAccount(id(data, "toAccountId", "Pick where it went."));
    if (!from) throw new FormError("Pick where it came from.");
    if (!to) throw new FormError("Pick where it went.");
    if (from.id === to.id) throw new FormError("Pick two different accounts.");
    const amount = money(data, "amount", { positive: true });

    // How much leaves the budget: positive paying out of it, negative into it.
    const leaving = (from.onBudget ? amount : 0) - (to.onBudget ? amount : 0);
    let envelopeId: number | null = null;
    if (leaving !== 0) {
      envelopeId =
        leaving < 0
          ? store.unallocatedId()
          : id(data, "envelopeId", `Pick the envelope paying ${to.name}; that money leaves the budget.`);
    }

    store.postEntry(
      transfer({
        date: date(data, "date"),
        fromAccountId: from.id,
        toAccountId: to.id,
        amount,
        envelopeId,
        envelopeAmount: leaving,
        payee: text(data, "payee") || `Transfer to ${to.name}`,
        memo: text(data, "memo"),
      }),
      user.id,
    );
    refresh();
    return { ok: `Moved ${formatMoney(amount)} from ${from.name} to ${to.name}.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

/** Money between envelopes. Taking an envelope below zero is refused. */
export async function postMove(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const store = getStore();
    const from = store.findEnvelope(id(data, "fromEnvelopeId", "Pick the envelope to take from."));
    const to = store.findEnvelope(id(data, "toEnvelopeId", "Pick the envelope to move it to."));
    if (!from) throw new FormError("Pick the envelope to take from.");
    if (!to) throw new FormError("Pick the envelope to move it to.");
    if (from.id === to.id) throw new FormError("Pick two different envelopes.");
    const amount = money(data, "amount", { positive: true });
    if (amount > from.balance) {
      throw new FormError(`${from.name} only has ${formatMoney(Math.max(0, from.balance))}.`);
    }

    store.postEntry(
      move({ date: date(data, "date"), fromEnvelopeId: from.id, toEnvelopeId: to.id, amount, memo: text(data, "memo") }),
      user.id,
    );
    refresh();
    return { ok: `Moved ${formatMoney(amount)} from ${from.name} to ${to.name}.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}
