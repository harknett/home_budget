import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LedgerError, Store } from "@/lib/db/store";
import { UnbalancedEntryError, expense, income, move, transfer } from "@/lib/ledger/entry";

let dir: string;
let store: Store;
const DAY = "2026-10-01";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "budget-"));
  store = new Store(join(dir, "test.db"));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The guarantee the app rests on, checked after every scenario. */
function expectInBalance() {
  const { onBudget, envelopes } = store.totals();
  expect(envelopes).toBe(onBudget);
}

function balanceOf(envelopeId: number) {
  return store.findEnvelope(envelopeId)!.balance;
}

function setup() {
  const checking = store.createAccount({
    name: "Checking",
    kind: "checking",
    onBudget: true,
    openingCents: 100_000,
    date: DAY,
    createdBy: null,
  });
  const group = store.createGroup("Everyday");
  const groceries = store.createEnvelope({ groupId: group, name: "Groceries", targetCents: 60_000 });
  const fuel = store.createEnvelope({ groupId: group, name: "Fuel", targetCents: null });
  return { checking, group, groceries, fuel, unallocated: store.unallocatedId() };
}

describe("the ledger", () => {
  it("starts with Unallocated and nothing else", () => {
    const envelopes = store.listEnvelopes();
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]!.isUnallocated).toBe(true);
    expectInBalance();
  });

  it("puts an opening balance in Unallocated", () => {
    const { checking, unallocated } = setup();
    expect(store.findAccount(checking.id)!.balance).toBe(100_000);
    expect(balanceOf(unallocated)).toBe(100_000);
    expectInBalance();
  });

  it("brings existing card debt into the budget from the start", () => {
    const { unallocated } = setup();
    store.createAccount({
      name: "Visa",
      kind: "credit_card",
      onBudget: true,
      openingCents: -30_000,
      date: DAY,
      createdBy: null,
    });
    expect(balanceOf(unallocated)).toBe(70_000);
    expectInBalance();
  });

  it("keeps a loan off the budget", () => {
    const { unallocated } = setup();
    const loan = store.createAccount({
      name: "Car loan",
      kind: "loan",
      onBudget: false,
      openingCents: -1_200_000,
      date: DAY,
      createdBy: null,
    });
    expect(store.findAccount(loan.id)!.balance).toBe(-1_200_000);
    expect(balanceOf(unallocated)).toBe(100_000);
    expectInBalance();
  });

  it("lands income in Unallocated", () => {
    const { checking, unallocated } = setup();
    store.postEntry(income({ date: DAY, accountId: checking.id, amount: 250_000, unallocatedId: unallocated }), null);
    expect(balanceOf(unallocated)).toBe(350_000);
    expectInBalance();
  });

  it("funds envelopes from Unallocated as one entry", () => {
    const { groceries, fuel, unallocated } = setup();
    const id = store.fund({
      date: DAY,
      amounts: [
        { envelopeId: groceries, amount: 40_000 },
        { envelopeId: fuel, amount: 10_000 },
        { envelopeId: fuel + 99, amount: 0 },
      ],
      planId: null,
      createdBy: null,
    });
    expect(id).not.toBeNull();
    expect(balanceOf(unallocated)).toBe(50_000);
    expect(balanceOf(groceries)).toBe(40_000);
    expect(balanceOf(fuel)).toBe(10_000);
    expectInBalance();
  });

  it("refuses to hand out more than is unallocated", () => {
    const { groceries, unallocated } = setup();
    expect(() =>
      store.fund({ date: DAY, amounts: [{ envelopeId: groceries, amount: 100_001 }], planId: null, createdBy: null }),
    ).toThrow(LedgerError);
    expect(balanceOf(unallocated)).toBe(100_000);
  });

  it("spends from an envelope, split across several", () => {
    const { checking, groceries, fuel } = setup();
    store.fund({
      date: DAY,
      amounts: [
        { envelopeId: groceries, amount: 40_000 },
        { envelopeId: fuel, amount: 10_000 },
      ],
      planId: null,
      createdBy: null,
    });
    store.postEntry(
      expense({
        date: DAY,
        accountId: checking.id,
        payee: "Costco",
        splits: [
          { envelopeId: groceries, amount: 12_000 },
          { envelopeId: fuel, amount: 4_500 },
        ],
      }),
      null,
    );
    expect(store.findAccount(checking.id)!.balance).toBe(83_500);
    expect(balanceOf(groceries)).toBe(28_000);
    expect(balanceOf(fuel)).toBe(5_500);
    expectInBalance();
  });

  it("treats a card purchase as spending, and paying the card as a transfer", () => {
    const { checking, groceries } = setup();
    const visa = store.createAccount({
      name: "Visa",
      kind: "credit_card",
      onBudget: true,
      openingCents: 0,
      date: DAY,
      createdBy: null,
    });
    store.fund({ date: DAY, amounts: [{ envelopeId: groceries, amount: 20_000 }], planId: null, createdBy: null });

    store.postEntry(
      expense({ date: DAY, accountId: visa.id, splits: [{ envelopeId: groceries, amount: 5_000 }] }),
      null,
    );
    expect(store.findAccount(visa.id)!.balance).toBe(-5_000);
    expect(balanceOf(groceries)).toBe(15_000);

    store.postEntry(
      transfer({ date: DAY, fromAccountId: checking.id, toAccountId: visa.id, amount: 5_000 }),
      null,
    );
    expect(store.findAccount(visa.id)!.balance).toBe(0);
    // Paying the card spends nothing new: the groceries were already counted.
    expect(balanceOf(groceries)).toBe(15_000);
    expectInBalance();
  });

  it("needs an envelope to pay a loan, because that money leaves the budget", () => {
    const { checking, unallocated } = setup();
    const loan = store.createAccount({
      name: "Car loan",
      kind: "loan",
      onBudget: false,
      openingCents: -500_000,
      date: DAY,
      createdBy: null,
    });
    expect(() =>
      store.postEntry(transfer({ date: DAY, fromAccountId: checking.id, toAccountId: loan.id, amount: 30_000 }), null),
    ).toThrow(UnbalancedEntryError);

    store.postEntry(
      transfer({
        date: DAY,
        fromAccountId: checking.id,
        toAccountId: loan.id,
        amount: 30_000,
        envelopeId: unallocated,
        envelopeAmount: 30_000,
      }),
      null,
    );
    expect(store.findAccount(loan.id)!.balance).toBe(-470_000);
    expectInBalance();
  });

  it("moves money between envelopes without touching an account", () => {
    const { checking, groceries, fuel } = setup();
    store.fund({ date: DAY, amounts: [{ envelopeId: groceries, amount: 20_000 }], planId: null, createdBy: null });
    store.postEntry(move({ date: DAY, fromEnvelopeId: groceries, toEnvelopeId: fuel, amount: 7_500 }), null);
    expect(balanceOf(groceries)).toBe(12_500);
    expect(balanceOf(fuel)).toBe(7_500);
    expect(store.findAccount(checking.id)!.balance).toBe(100_000);
    expectInBalance();
  });

  it("refuses an entry whose sides do not match, and writes nothing", () => {
    const { checking, groceries } = setup();
    expect(() =>
      store.postEntry(
        {
          date: DAY,
          kind: "expense",
          payee: "",
          memo: "",
          accountLines: [{ accountId: checking.id, amount: -1000 }],
          envelopeLines: [{ envelopeId: groceries, amount: -900 }],
        },
        null,
      ),
    ).toThrow(UnbalancedEntryError);
    expect(store.register(checking.id)).toHaveLength(1);
    expectInBalance();
  });

  it("deletes both sides of an entry together", () => {
    const { checking, groceries } = setup();
    const id = store.postEntry(
      expense({ date: DAY, accountId: checking.id, splits: [{ envelopeId: groceries, amount: 1000 }] }),
      null,
    );
    store.deleteEntry(id);
    expect(store.findAccount(checking.id)!.balance).toBe(100_000);
    expect(balanceOf(groceries)).toBe(0);
    expectInBalance();
  });

  it("keeps a running balance in the register, newest first", () => {
    const { checking, groceries } = setup();
    store.postEntry(
      expense({ date: "2026-10-03", accountId: checking.id, splits: [{ envelopeId: groceries, amount: 2000 }] }),
      null,
    );
    store.postEntry(
      expense({ date: "2026-10-02", accountId: checking.id, splits: [{ envelopeId: groceries, amount: 1000 }] }),
      null,
    );
    const rows = store.register(checking.id);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-03", "2026-10-02", DAY]);
    expect(rows.map((r) => r.runningBalance)).toEqual([97_000, 99_000, 100_000]);
    expect(rows[0]!.envelopes).toBe("Groceries");
  });

  it("tracks the cleared balance separately", () => {
    const { checking, groceries } = setup();
    store.postEntry(
      expense({ date: DAY, accountId: checking.id, splits: [{ envelopeId: groceries, amount: 1000 }] }),
      null,
    );
    const [newest, openingLine] = store.register(checking.id);
    store.setLineStatus(openingLine!.lineId, "cleared");
    const account = store.findAccount(checking.id)!;
    expect(account.balance).toBe(99_000);
    expect(account.clearedBalance).toBe(100_000);
    store.setLineStatus(newest!.lineId, "cleared");
    expect(store.findAccount(checking.id)!.clearedBalance).toBe(99_000);
  });

  it("closes only an empty account", () => {
    const { checking } = setup();
    expect(() => store.closeAccount(checking.id)).toThrow(LedgerError);
    const empty = store.createAccount({
      name: "Old savings",
      kind: "savings",
      onBudget: true,
      openingCents: 0,
      date: DAY,
      createdBy: null,
    });
    store.closeAccount(empty.id);
    expect(store.listAccounts().map((a) => a.name)).toEqual(["Checking"]);
  });

  it("deletes an unused envelope but only hides one with history", () => {
    const { checking, groceries, fuel } = setup();
    store.postEntry(
      expense({ date: DAY, accountId: checking.id, splits: [{ envelopeId: groceries, amount: 1000 }] }),
      null,
    );
    expect(() => store.deleteEnvelope(groceries)).toThrow(LedgerError);
    store.deleteEnvelope(fuel);
    expect(store.findEnvelope(fuel)).toBeUndefined();
    expect(() => store.deleteEnvelope(store.unallocatedId())).toThrow(LedgerError);
  });
});

describe("funding plans", () => {
  it("advances a plan by one run each time it is funded, even at zero", () => {
    const { groceries } = setup();
    const planId = store.createPlan({ name: "Payday", startDate: DAY, every: 2, unit: "week" });
    store.setPlanLines(planId, [
      { envelopeId: groceries, rule: "fixed", amountCents: 25_000 },
      // A zero fixed line means nothing and is not kept.
      { envelopeId: groceries + 1, rule: "fixed", amountCents: 0 },
    ]);
    expect(store.findPlan(planId)!.lines).toHaveLength(1);

    store.fund({ date: DAY, amounts: [{ envelopeId: groceries, amount: 25_000 }], planId, createdBy: null });
    expect(store.findPlan(planId)!.runs).toBe(1);

    // Skipping a run is confirming it with nothing in it.
    expect(store.fund({ date: DAY, amounts: [], planId, createdBy: null })).toBeNull();
    expect(store.findPlan(planId)!.runs).toBe(2);
    expectInBalance();
  });

  it("restarts the run count when the schedule changes", () => {
    const planId = store.createPlan({ name: "Monthly", startDate: DAY, every: 1, unit: "month" });
    store.fund({ date: DAY, amounts: [], planId, createdBy: null });
    store.updatePlan(planId, { name: "Bills", startDate: DAY, every: 1, unit: "month", active: true });
    expect(store.findPlan(planId)!.runs).toBe(1);
    store.updatePlan(planId, { name: "Bills", startDate: "2026-10-15", every: 1, unit: "month", active: true });
    expect(store.findPlan(planId)!.runs).toBe(0);
  });

  it("leaves the funding history standing when a plan is deleted", () => {
    const { groceries } = setup();
    const planId = store.createPlan({ name: "Payday", startDate: DAY, every: 1, unit: "week" });
    store.fund({ date: DAY, amounts: [{ envelopeId: groceries, amount: 5_000 }], planId, createdBy: null });
    store.deletePlan(planId);
    expect(balanceOf(groceries)).toBe(5_000);
    expectInBalance();
  });
});
