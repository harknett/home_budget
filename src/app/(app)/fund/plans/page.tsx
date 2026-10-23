import Link from "next/link";

import { Empty, PageTitle, Row } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { shortDate, today } from "@/lib/dates";
import { occurrence, describeCadence } from "@/lib/funding/schedule";
import { formatMoney } from "@/lib/money";

import { PlanEditor } from "./editor";

export const metadata = { title: "Funding plans - Home Budget" };
export const dynamic = "force-dynamic";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  const store = getStore();
  const plans = store.listPlans();
  const envelopes = store.listEnvelopes().filter((e) => !e.isUnallocated);
  const groups = new Map(store.listGroups().map((g) => [g.id, g.name]));
  const edit = (await searchParams).edit;
  const editing = edit === "new" ? null : plans.find((p) => String(p.id) === edit);

  const envelopeRows = envelopes.map((e) => ({
    id: e.id,
    name: e.name,
    group: e.groupId === null ? "" : (groups.get(e.groupId) ?? ""),
    targetCents: e.targetCents,
  }));

  if (edit !== undefined && (edit === "new" || editing)) {
    return (
      <>
        <PageTitle>{editing ? `Edit ${editing.name}` : "New plan"}</PageTitle>
        <PlanEditor plan={editing ?? null} envelopes={envelopeRows} today={today(user.timeZone)} />
      </>
    );
  }

  return (
    <>
      <PageTitle
        actions={
          <Link
            href="/fund/plans?edit=new"
            className="rounded bg-ink px-2.5 py-1 text-xs font-medium text-paper dark:bg-paper dark:text-ink"
          >
            New plan
          </Link>
        }
      >
        Funding plans
      </PageTitle>
      <p className="mb-3 text-xs opacity-70">
        A plan proposes amounts on a schedule — every payday, or the 1st of the month. Nothing is funded until you
        confirm it on Fund.
      </p>
      {plans.length === 0 ? <Empty>No plans yet.</Empty> : null}
      {plans.map((p) => {
        const total = p.lines.filter((l) => l.rule === "fixed").reduce((sum, l) => sum + l.amountCents, 0);
        const topUps = p.lines.filter((l) => l.rule === "top_up").length;
        return (
          <Link key={p.id} href={`/fund/plans?edit=${p.id}`} className="block hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <Row className={p.active ? "" : "opacity-50"}>
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                <span className="ml-1.5 text-xs opacity-60">
                  {describeCadence(p)} · next {shortDate(occurrence(p, p.runs))}
                  {p.active ? "" : " · paused"}
                </span>
              </span>
              <span className="num text-xs opacity-70">
                {formatMoney(total)}
                {topUps > 0 ? ` + ${topUps} top-up${topUps === 1 ? "" : "s"}` : ""}
              </span>
            </Row>
          </Link>
        );
      })}
    </>
  );
}
