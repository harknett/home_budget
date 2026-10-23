import Link from "next/link";

import { UnallocatedBar } from "@/components/unallocated-bar";
import { Empty, Money, Notice, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { today } from "@/lib/dates";
import { planStatuses } from "@/lib/funding/due";
import { formatMoney } from "@/lib/money";

import { QuickMove } from "./quick-move";

export const metadata = { title: "Envelopes - Home Budget" };
export const dynamic = "force-dynamic";

/**
 * The main screen: every envelope, as dense as it will go.
 *
 * One row per envelope — name, a thin bar towards its target, the balance.
 * Tapping a row opens it in place for the two things you do from here:
 * spend from it, or move money in or out. No separate screen to load.
 */
export default async function EnvelopesPage() {
  const user = await requireUser();
  const store = getStore();
  const envelopes = store.listEnvelopes();
  const groups = store.listGroups();
  const unallocated = envelopes.find((e) => e.isUnallocated)!;
  const due = planStatuses(store.listPlans(), today(user.timeZone)).filter((s) => s.due > 0).length;
  const { onBudget, envelopes: inEnvelopes } = store.totals();

  const options = envelopes.map((e) => ({ id: e.id, name: e.name, balance: e.balance }));

  return (
    <>
      <UnallocatedBar cents={unallocated.balance} plansDue={due} />

      {onBudget !== inEnvelopes ? (
        <div className="mb-3">
          <Notice kind="error">
            Accounts hold {formatMoney(onBudget)} but envelopes hold {formatMoney(inEnvelopes)}. That should never
            happen — please report it.
          </Notice>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <Empty>
          No envelopes yet. Make some under <Link className="underline" href="/envelopes">More → Envelopes</Link>.
        </Empty>
      ) : null}

      {groups.map((group) => {
        const list = envelopes.filter((e) => e.groupId === group.id);
        if (list.length === 0) return null;
        const total = list.reduce((sum, e) => sum + e.balance, 0);
        return (
          <Section key={group.id} title={group.name} aside={formatMoney(total)}>
            {list.map((e) => {
              const short = e.targetCents !== null && e.balance < e.targetCents;
              const progress =
                e.targetCents && e.targetCents > 0 ? Math.max(0, Math.min(1, e.balance / e.targetCents)) : null;
              return (
                <details key={e.id} className="group border-b border-rule dark:border-white/10">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-1 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {progress !== null ? (
                      <span
                        className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
                        title={`Target ${formatMoney(e.targetCents!)}`}
                      >
                        <span
                          className={`block h-full ${short ? "bg-warn" : "bg-good"}`}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </span>
                    ) : null}
                    <Money cents={e.balance} className="w-24 font-medium" />
                  </summary>
                  <div className="space-y-2 bg-black/[0.03] px-2 py-2 dark:bg-white/[0.04]">
                    <div className="flex flex-wrap gap-3 text-xs">
                      <Link className="underline" href={`/add?type=expense&envelope=${e.id}`}>
                        Spend from it
                      </Link>
                      <Link className="underline" href={`/envelopes/${e.id}`}>
                        History
                      </Link>
                      {e.targetCents !== null ? (
                        <span className="opacity-60">Target {formatMoney(e.targetCents)}</span>
                      ) : null}
                    </div>
                    <QuickMove envelopeId={e.id} envelopes={options} today={today(user.timeZone)} />
                  </div>
                </details>
              );
            })}
          </Section>
        );
      })}
    </>
  );
}
