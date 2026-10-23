import Link from "next/link";

import { PageTitle, Row, Section } from "@/components/ui";
import { signOut } from "@/app/(auth)/actions";
import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";

import { AddMember, RemoveMember, TimeZoneForm } from "./forms";

export const metadata = { title: "More - Home Budget" };
export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/envelopes", label: "Envelopes", hint: "groups, names, targets, order" },
  { href: "/fund/plans", label: "Funding plans", hint: "what to fund, and when" },
  { href: "/change-password", label: "Change password", hint: "" },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const users = user.role === "owner" ? getStore().listUsers() : [];

  return (
    <>
      <PageTitle>More</PageTitle>
      <Section title="Set up">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="block hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <Row>
              <span className="flex-1">{l.label}</span>
              <span className="text-xs opacity-50">{l.hint}</span>
            </Row>
          </Link>
        ))}
      </Section>

      <Section title="You">
        <div className="space-y-2 px-1 py-2">
          <p className="text-sm">
            {user.name} <span className="opacity-60">· {user.email}</span>
          </p>
          <TimeZoneForm timeZone={user.timeZone} />
          <form action={signOut}>
            <button className="text-sm underline opacity-70">Sign out</button>
          </form>
        </div>
      </Section>

      {user.role === "owner" ? (
        <Section title="Household logins">
          {users.map((u) => (
            <Row key={u.id}>
              <span className="min-w-0 flex-1 truncate">
                {u.name} <span className="text-xs opacity-60">{u.email}</span>
              </span>
              <span className="text-xs opacity-60">
                {u.role}
                {u.mustChangePassword ? " · temp password" : ""}
              </span>
              {u.id !== user.id ? <RemoveMember id={u.id} name={u.name} /> : null}
            </Row>
          ))}
          <AddMember />
        </Section>
      ) : null}
    </>
  );
}
