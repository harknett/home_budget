/**
 * The shape of everything that moves money, and the one rule it obeys.
 *
 * Every record (an "entry") has two sides:
 *
 *   - **Account lines** say where money physically moved: checking down 50,
 *     the Visa owing 50 more. Amounts are the change in the account's
 *     balance, so a credit card balance is negative while money is owed.
 *   - **Envelope lines** say what the money was for: Groceries down 50.
 *
 * **The rule:** within an entry, the account lines on on-budget accounts sum
 * to exactly the envelope lines. So at every moment, the money in on-budget
 * accounts equals the money in envelopes, Unallocated included — the
 * guarantee the whole app rests on. Off-budget accounts (loans) carry no
 * envelope side; paying one from checking is spending from an envelope.
 *
 * How each action satisfies it:
 *
 *   expense        account −x            envelope(s) −x
 *   income         account +x            Unallocated +x
 *   transfer       from −x, to +x        (nothing; sums to 0 on-budget)
 *   envelope move  (nothing)             from −x, to +x
 *   funding        (nothing)             Unallocated −Σ, each envelope +
 *   adjustment     account ±x            Unallocated ±x
 *
 * This module is pure: it builds and checks entries. The store refuses to
 * write one that fails `checkBalanced`.
 */

export const ENTRY_KINDS = [
  "expense",
  "income",
  "transfer",
  "move",
  "funding",
  "adjustment",
  "opening",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export interface AccountLine {
  accountId: number;
  /** Change in the account's balance, in cents. */
  amount: number;
}

export interface EnvelopeLine {
  envelopeId: number;
  /** Change in the envelope's balance, in cents. */
  amount: number;
}

export interface NewEntry {
  date: string;
  kind: EntryKind;
  payee: string;
  memo: string;
  accountLines: AccountLine[];
  envelopeLines: EnvelopeLine[];
  /** Set when this entry is a funding plan's run. */
  planId?: number | null;
}

export class UnbalancedEntryError extends Error {}

/**
 * Throw unless the entry obeys the rule. `onBudget` answers for each account
 * the entry touches; an account it does not know is an error, not a guess.
 */
export function checkBalanced(entry: NewEntry, onBudget: (accountId: number) => boolean | undefined): void {
  if (entry.accountLines.length === 0 && entry.envelopeLines.length === 0) {
    throw new UnbalancedEntryError("An entry has to move some money.");
  }
  for (const line of [...entry.accountLines, ...entry.envelopeLines]) {
    if (!Number.isSafeInteger(line.amount)) {
      throw new UnbalancedEntryError("Amounts are whole cents.");
    }
  }

  let accounts = 0;
  for (const line of entry.accountLines) {
    const flag = onBudget(line.accountId);
    if (flag === undefined) throw new UnbalancedEntryError(`No account ${line.accountId}.`);
    if (flag) accounts += line.amount;
  }
  const envelopes = entry.envelopeLines.reduce((sum, line) => sum + line.amount, 0);

  if (accounts !== envelopes) {
    throw new UnbalancedEntryError(
      `Accounts move ${accounts} but envelopes move ${envelopes}; they must match.`,
    );
  }
}

// --- builders ----------------------------------------------------------------
// One per action, so a screen states what it means and the arithmetic of the
// two sides is written once, here.

interface Common {
  date: string;
  payee?: string;
  memo?: string;
}

/**
 * Money leaving an account for one or more envelopes. `splits` are positive
 * spend amounts; a refund is a negative split. Off-budget accounts cannot
 * spend from envelopes — the store's check will say so.
 */
export function expense(
  input: Common & { accountId: number; splits: { envelopeId: number; amount: number }[] },
): NewEntry {
  const total = input.splits.reduce((sum, s) => sum + s.amount, 0);
  return {
    date: input.date,
    kind: "expense",
    payee: input.payee ?? "",
    memo: input.memo ?? "",
    accountLines: [{ accountId: input.accountId, amount: -total }],
    envelopeLines: input.splits.map((s) => ({ envelopeId: s.envelopeId, amount: -s.amount })),
  };
}

/** Money arriving in an account, landing in Unallocated until it is funded. */
export function income(
  input: Common & { accountId: number; amount: number; unallocatedId: number },
): NewEntry {
  return {
    date: input.date,
    kind: "income",
    payee: input.payee ?? "",
    memo: input.memo ?? "",
    accountLines: [{ accountId: input.accountId, amount: input.amount }],
    envelopeLines: [{ envelopeId: input.unallocatedId, amount: input.amount }],
  };
}

/**
 * Money between accounts: a savings sweep, or paying the credit card.
 *
 * Between two on-budget accounts no envelope moves. Paying an off-budget
 * account (a loan) from an on-budget one leaves the budget, so it needs an
 * envelope to come from: pass `envelopeId`.
 */
export function transfer(
  input: Common & {
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    envelopeId?: number | null;
    /** Positive when money leaves the budget, negative when it enters. */
    envelopeAmount?: number;
  },
): NewEntry {
  const envelopeLines =
    input.envelopeId != null && input.envelopeAmount
      ? [{ envelopeId: input.envelopeId, amount: -input.envelopeAmount }]
      : [];
  return {
    date: input.date,
    kind: "transfer",
    payee: input.payee ?? "",
    memo: input.memo ?? "",
    accountLines: [
      { accountId: input.fromAccountId, amount: -input.amount },
      { accountId: input.toAccountId, amount: input.amount },
    ],
    envelopeLines,
  };
}

/** Money between envelopes. No account notices. */
export function move(
  input: Common & { fromEnvelopeId: number; toEnvelopeId: number; amount: number },
): NewEntry {
  return {
    date: input.date,
    kind: "move",
    payee: "",
    memo: input.memo ?? "",
    accountLines: [],
    envelopeLines: [
      { envelopeId: input.fromEnvelopeId, amount: -input.amount },
      { envelopeId: input.toEnvelopeId, amount: input.amount },
    ],
  };
}

/**
 * Unallocated money handed out to envelopes, as one entry so a funding round
 * reads — and can be undone — as the single act it was. Zero amounts are
 * dropped; a negative amount takes money back to Unallocated.
 */
export function funding(
  input: Common & {
    unallocatedId: number;
    amounts: { envelopeId: number; amount: number }[];
    planId?: number | null;
  },
): NewEntry {
  const lines = input.amounts.filter((a) => a.amount !== 0);
  const total = lines.reduce((sum, a) => sum + a.amount, 0);
  return {
    date: input.date,
    kind: "funding",
    payee: "",
    memo: input.memo ?? "",
    accountLines: [],
    envelopeLines: [
      { envelopeId: input.unallocatedId, amount: -total },
      ...lines.map((a) => ({ envelopeId: a.envelopeId, amount: a.amount })),
    ],
    planId: input.planId ?? null,
  };
}

/**
 * A new account's starting balance. On-budget, it lands in Unallocated — a
 * credit card already owing lands there as a negative, so existing debt is in
 * the budget from day one rather than a surprise later.
 */
export function opening(
  input: Common & { accountId: number; amount: number; onBudget: boolean; unallocatedId: number },
): NewEntry {
  return {
    date: input.date,
    kind: "opening",
    payee: "Opening balance",
    memo: input.memo ?? "",
    accountLines: [{ accountId: input.accountId, amount: input.amount }],
    envelopeLines: input.onBudget ? [{ envelopeId: input.unallocatedId, amount: input.amount }] : [],
  };
}
