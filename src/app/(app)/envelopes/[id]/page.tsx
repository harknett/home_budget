import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteEntry } from "@/components/delete-entry";
import { Empty, Money, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { shortDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Envelope - Home Budget" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  expense: "",
  income: "Income",
  transfer: "Transfer",
  move: "Moved",
  funding: "Funded",
  adjustment: "Adjustment",
  opening: "Opening balance",
};

export default async function EnvelopeHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const store = getStore();
  const envelope = store.findEnvelope(Number((await params).id));
  if (!envelope) notFound();
  const activity = store.envelopeActivity(envelope.id);

  return (
    <>
      <PageTitle
        actions={
          <Link
            href={`/add?type=expense&envelope=${envelope.id}`}
            className="rounded bg-ink px-2.5 py-1 text-xs font-medium text-paper dark:bg-paper dark:text-ink"
          >
            Spend
          </Link>
        }
      >
        {envelope.name} <Money cents={envelope.balance} className="ml-1 text-base font-normal" />
      </PageTitle>
      {envelope.targetCents !== null ? (
        <p className="-mt-2 mb-3 text-xs opacity-60">Target {formatMoney(envelope.targetCents)}</p>
      ) : null}

      {activity.length === 0 ? <Empty>Nothing in or out yet.</Empty> : null}
      {activity.map((a) => (
        <details key={a.entryId} className="border-b border-rule dark:border-white/10">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-1 text-sm [&::-webkit-details-marker]:hidden">
            <span className="w-12 shrink-0 text-xs opacity-60">{shortDate(a.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              {a.payee || KIND_LABELS[a.kind]}
              {a.accounts ? <span className="ml-1 text-xs opacity-50">{a.accounts}</span> : null}
            </span>
            <Money cents={a.amount} className="w-24" />
          </summary>
          <div className="flex items-center gap-3 px-1 pb-2 text-xs">
            {a.memo ? <span className="opacity-70">{a.memo}</span> : null}
            <DeleteEntry entryId={a.entryId} />
          </div>
        </details>
      ))}
    </>
  );
}
