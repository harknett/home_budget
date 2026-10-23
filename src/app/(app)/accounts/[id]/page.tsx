import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteEntry } from "@/components/delete-entry";
import { Button, Empty, Money, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { ACCOUNT_KIND_LABELS } from "@/lib/db/types";
import { shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

import { toggleCleared } from "../../entry-actions";
import { reopenAccount } from "../actions";
import { AccountSettings } from "../forms";

export const metadata = { title: "Account - Home Budget" };
export const dynamic = "force-dynamic";

/**
 * An account's register: newest first, a running balance on every row, and
 * a tick for what the bank has cleared. The tick column is what
 * reconciliation will work from.
 */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const store = getStore();
  const account = store.findAccount(Number((await params).id));
  if (!account) notFound();
  const rows = store.register(account.id);

  return (
    <>
      <PageTitle
        actions={
          account.closedAt === null ? (
            <Link
              href={`/add?type=expense&account=${account.id}`}
              className="rounded bg-ink px-2.5 py-1 text-xs font-medium text-paper dark:bg-paper dark:text-ink"
            >
              + Add
            </Link>
          ) : null
        }
      >
        {account.name}
      </PageTitle>
      <div className="-mt-2 mb-3 flex gap-4 text-xs">
        <span className="opacity-60">
          {ACCOUNT_KIND_LABELS[account.kind]}
          {account.onBudget ? "" : " · off budget"}
          {account.closedAt ? " · closed" : ""}
        </span>
        <span className="ml-auto">
          Balance <Money cents={account.balance} className="font-medium" />
        </span>
        <span>
          Cleared <Money cents={account.clearedBalance} />
        </span>
      </div>

      {rows.length === 0 ? <Empty>No transactions yet.</Empty> : null}
      {rows.map((r) => {
        const cleared = r.status !== "uncleared";
        return (
          <details key={r.lineId} className="border-b border-rule dark:border-white/10">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-1 text-sm [&::-webkit-details-marker]:hidden">
              <span className="w-12 shrink-0 text-xs opacity-60">{shortDate(r.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.payee || (r.otherAccount ? `Transfer · ${r.otherAccount}` : r.kind)}
                <span className="ml-1 text-xs opacity-50">{r.envelopes}</span>
              </span>
              <span
                className={`w-4 shrink-0 text-center text-xs ${cleared ? "text-good" : "opacity-25"}`}
                title={r.status}
              >
                {r.status === "reconciled" ? "R" : "✓"}
              </span>
              <Money cents={r.amount} className="w-20" />
              <span className="num hidden w-24 text-xs opacity-50 sm:inline">{formatMoney(r.runningBalance)}</span>
            </summary>
            <div className="flex flex-wrap items-center gap-3 px-1 pb-2 text-xs">
              {r.memo ? <span className="opacity-70">{r.memo}</span> : null}
              <span className="opacity-60 sm:hidden">Balance after {formatMoney(r.runningBalance)}</span>
              {r.status !== "reconciled" ? (
                <form action={toggleCleared}>
                  <input type="hidden" name="lineId" value={r.lineId} />
                  <input type="hidden" name="cleared" value={cleared ? "1" : "0"} />
                  <button className="underline">{cleared ? "Mark uncleared" : "Mark cleared"}</button>
                </form>
              ) : (
                <span className="opacity-60">Reconciled — locked</span>
              )}
              {r.status !== "reconciled" ? <DeleteEntry entryId={r.entryId} /> : null}
            </div>
          </details>
        );
      })}

      {account.closedAt === null ? (
        <AccountSettings id={account.id} name={account.name} />
      ) : (
        <form action={reopenAccount} className="mt-4">
          <input type="hidden" name="id" value={account.id} />
          <Button size="sm" variant="quiet" type="submit">
            Reopen account
          </Button>
        </form>
      )}
    </>
  );
}
