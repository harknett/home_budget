import type { CadenceUnit } from "@/lib/funding/schedule";
import type { EntryKind } from "@/lib/ledger/entry";

export type Role = "owner" | "member";

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  timeZone: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export const ACCOUNT_KINDS = ["checking", "savings", "cash", "credit_card", "loan"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  loan: "Loan",
};

export function isAccountKind(value: unknown): value is AccountKind {
  return typeof value === "string" && (ACCOUNT_KINDS as readonly string[]).includes(value);
}

export interface Account {
  id: number;
  name: string;
  kind: AccountKind;
  onBudget: boolean;
  position: number;
  closedAt: string | null;
  /** Sum of every line, in cents. */
  balance: number;
  /** Sum of cleared and reconciled lines: what the bank should agree with. */
  clearedBalance: number;
}

export interface EnvelopeGroup {
  id: number;
  name: string;
  position: number;
}

export interface Envelope {
  id: number;
  groupId: number | null;
  name: string;
  position: number;
  targetCents: number | null;
  hidden: boolean;
  isUnallocated: boolean;
  balance: number;
}

export type PlanRule = "fixed" | "top_up";

export interface FundingPlanLine {
  envelopeId: number;
  rule: PlanRule;
  amountCents: number;
}

export interface FundingPlan {
  id: number;
  name: string;
  startDate: string;
  every: number;
  unit: CadenceUnit;
  runs: number;
  active: boolean;
  lines: FundingPlanLine[];
}

export type LineStatus = "uncleared" | "cleared" | "reconciled";

/** One row of an account's register: the line, with its entry around it. */
export interface RegisterRow {
  lineId: number;
  entryId: number;
  date: string;
  kind: EntryKind;
  payee: string;
  memo: string;
  amount: number;
  status: LineStatus;
  /** The envelopes it touched, by name, for the register's middle column. */
  envelopes: string;
  /** For a transfer, the account on the other side. */
  otherAccount: string | null;
  runningBalance: number;
}

/** One row of an envelope's history. */
export interface EnvelopeActivity {
  entryId: number;
  date: string;
  kind: EntryKind;
  payee: string;
  memo: string;
  amount: number;
  /** The account(s) the money moved in, if any. */
  accounts: string;
}
