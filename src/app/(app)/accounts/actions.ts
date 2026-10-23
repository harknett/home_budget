"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { isAccountKind } from "@/lib/db/types";
import { FormError, date, failure, id, money, requiredText, text, type FormState } from "@/lib/forms";
import { UnbalancedEntryError } from "@/lib/ledger/entry";

const KNOWN = [LedgerError, UnbalancedEntryError];

/**
 * Open an account. The balance is entered as the bank shows it — for a card
 * or loan, the amount owed — and stored the way the ledger counts it: owed
 * money is negative.
 */
export async function createAccount(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const name = requiredText(data, "name", "Name the account.");
    const kind = text(data, "kind");
    if (!isAccountKind(kind)) throw new FormError("Pick a kind of account.");
    const entered = text(data, "balance") === "" ? 0 : money(data, "balance");
    const owed = kind === "credit_card" || kind === "loan";
    const openingCents = owed ? -Math.abs(entered) : entered;

    getStore().createAccount({
      name,
      kind,
      // Loans sit outside the budget; everything else is what the envelopes divide.
      onBudget: kind !== "loan",
      openingCents,
      date: date(data, "date"),
      createdBy: user.id,
    });
    revalidatePath("/", "layout");
    return { ok: `${name} added.`, at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function renameAccount(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().renameAccount(id(data, "id", "No such account."), requiredText(data, "name", "Name the account."));
    revalidatePath("/", "layout");
    return { ok: "Saved.", at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function closeAccount(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().closeAccount(id(data, "id", "No such account."));
    revalidatePath("/", "layout");
    return { ok: "Closed.", at: Date.now() };
  } catch (err) {
    return failure(err, KNOWN);
  }
}

export async function reopenAccount(data: FormData): Promise<void> {
  await requireUser();
  getStore().reopenAccount(Number(data.get("id")));
  revalidatePath("/", "layout");
}
