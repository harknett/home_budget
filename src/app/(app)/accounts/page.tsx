import Link from "next/link";

import { Empty, Money, PageTitle, Row, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, type Account } from "@/lib/db/types";
import { today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import { NewAccount } from "./forms";

export const metadata = { title: "Accounts - Home Budget" };
export const dynamic = "force-dynamic";

function AccountRow({ account }: { account: Account }) {
  const uncleared = account.balance - account.clearedBalance;
  return (
    <Link href={`/accounts/${account.id}`} className="block hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
      <Row>
        <span className="min-w-0 flex-1 truncate">
          {account.name}
          <span className="ml-1.5 text-xs opacity-50">{ACCOUNT_KIND_LABELS[account.kind]}</span>
        </span>
        {uncleared !== 0 ? (
          <span className="num text-xs opacity-60" title="Not yet cleared by the bank">
            {formatMoney(uncleared)} pending
          </span>
        ) : null}
        <Money cents={account.balance} className="w-24 font-medium" />
      </Row>
    </Link>
  );
}

export default async function AccountsPage() {
  const user = await requireUser();
  const store = getStore();
  const accounts = store.listAccounts(true);
  const open = accounts.filter((a) => a.closedAt === null);
  const onBudget = open.filter((a) => a.onBudget);
  const offBudget = open.filter((a) => !a.onBudget);
  const closed = accounts.filter((a) => a.closedAt !== null);
  const sum = (list: Account[]) => list.reduce((total, a) => total + a.balance, 0);

  return (
    <>
      <PageTitle>Accounts</PageTitle>
      {open.length === 0 ? <Empty>No accounts yet. Add the first one below.</Empty> : null}
      {onBudget.length > 0 ? (
        <Section title="On budget" aside={formatMoney(sum(onBudget))}>
          {onBudget.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </Section>
      ) : null}
      {offBudget.length > 0 ? (
        <Section title="Off budget" aside={formatMoney(sum(offBudget))}>
          {offBudget.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </Section>
      ) : null}
      {open.length > 0 ? (
        <Row className="mb-4 font-medium">
          <span className="flex-1">Net worth</span>
          <Money cents={sum(open)} className="w-24" />
        </Row>
      ) : null}

      <NewAccount today={today(user.timeZone)} />

      {closed.length > 0 ? (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer opacity-60">Closed ({closed.length})</summary>
          {closed.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </details>
      ) : null}
    </>
  );
}
