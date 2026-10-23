import { PageTitle, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";

import { EnvelopeEditor, GroupEditor, NewEnvelope, NewGroup } from "./editors";

export const metadata = { title: "Envelopes - Home Budget" };
export const dynamic = "force-dynamic";

/** Arranging the envelopes: groups, names, targets, order, hiding. */
export default async function ManageEnvelopesPage() {
  await requireUser();
  const store = getStore();
  const groups = store.listGroups();
  const envelopes = store.listEnvelopes(true).filter((e) => !e.isUnallocated);
  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <>
      <PageTitle>Envelopes</PageTitle>
      <p className="mb-3 text-xs opacity-70">
        A target is what a &ldquo;top up&rdquo; funding plan fills to. An envelope with history can be hidden but not
        deleted.
      </p>

      {groups.map((g, i) => (
        <Section key={g.id} title={<GroupEditor group={g} first={i === 0} last={i === groups.length - 1} />}>
          {envelopes
            .filter((e) => e.groupId === g.id)
            .map((e, j, list) => (
              <EnvelopeEditor
                key={e.id}
                envelope={e}
                groups={groupOptions}
                first={j === 0}
                last={j === list.length - 1}
              />
            ))}
          <NewEnvelope groupId={g.id} />
        </Section>
      ))}

      <NewGroup />
    </>
  );
}
