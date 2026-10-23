import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { today } from "@/lib/dates";

import { AddForms, type Kind } from "./forms";

export const metadata = { title: "Add - Home Budget" };
export const dynamic = "force-dynamic";

const KINDS: Kind[] = ["expense", "income", "transfer", "move"];

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; envelope?: string; account?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const store = getStore();

  const kind = KINDS.includes(params.type as Kind) ? (params.type as Kind) : "expense";
  const groups = new Map(store.listGroups().map((g) => [g.id, g.name]));

  return (
    <>
      <PageTitle>Add</PageTitle>
      <AddForms
        initialKind={kind}
        today={today(user.timeZone)}
        accounts={store.listAccounts().map((a) => ({ id: a.id, name: a.name, onBudget: a.onBudget, balance: a.balance }))}
        envelopes={store.listEnvelopes().map((e) => ({
          id: e.id,
          name: e.name,
          group: e.groupId === null ? "" : (groups.get(e.groupId) ?? ""),
          balance: e.balance,
          isUnallocated: e.isUnallocated,
        }))}
        envelopeId={Number(params.envelope) || null}
        accountId={Number(params.account) || null}
      />
    </>
  );
}
