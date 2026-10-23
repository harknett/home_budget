import Link from "next/link";

import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { today } from "@/lib/dates";
import { planStatuses } from "@/lib/funding/due";
import { proposeAmounts } from "@/lib/funding/proposal";
import { describeCadence } from "@/lib/funding/schedule";

import { FundForm } from "./form";

export const metadata = { title: "Fund - Home Budget" };
export const dynamic = "force-dynamic";

/**
 * Giving Unallocated money a job.
 *
 * Every envelope is a row with its balance, what the chosen plan would put
 * in, and a box for what actually goes in. The Unallocated figure at the top
 * updates as you type, so the question "do I fund the plan, or something
 * else?" is answered against the money that is really there.
 */
export default async function FundPage() {
  const user = await requireUser();
  const store = getStore();
  const day = today(user.timeZone);
  const envelopes = store.listEnvelopes();
  const groups = store.listGroups();
  const unallocated = envelopes.find((e) => e.isUnallocated)!;
  const byId = new Map(envelopes.map((e) => [e.id, e]));

  const plans = planStatuses(store.listPlans(), day).map((s) => ({
    id: s.plan.id,
    name: s.plan.name,
    cadence: describeCadence(s.plan),
    due: s.due,
    nextDate: s.nextDate,
    // Computed here, against live balances, so a top-up line proposes what
    // the envelope is actually short of right now.
    proposal: Object.fromEntries(proposeAmounts(s.plan.lines, byId)),
  }));

  return (
    <>
      <PageTitle
        actions={
          <Link href="/fund/plans" className="text-xs underline opacity-70">
            Edit plans
          </Link>
        }
      >
        Fund
      </PageTitle>
      <FundForm
        today={day}
        unallocated={unallocated.balance}
        plans={plans}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          envelopes: envelopes
            .filter((e) => e.groupId === g.id)
            .map((e) => ({ id: e.id, name: e.name, balance: e.balance, targetCents: e.targetCents })),
        }))}
      />
    </>
  );
}
