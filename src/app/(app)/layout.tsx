import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "../(auth)/actions";
import { requireUser } from "@/lib/auth/guard";

/**
 * The signed-in shell.
 *
 * Navigation sits at the bottom on a phone, where a thumb reaches, and at the
 * top on a laptop. One list of links, two positions. The bar is short on
 * purpose: every pixel it takes is an envelope row that is not shown.
 */
const LINKS = [
  { href: "/", label: "Envelopes" },
  { href: "/accounts", label: "Accounts" },
  { href: "/add", label: "+ Add" },
  { href: "/fund", label: "Fund" },
  { href: "/settings", label: "More" },
] as const;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="hidden border-b border-rule sm:block dark:border-white/10">
        <nav className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-1.5">
          <Link href="/" className="mr-3 text-sm font-semibold tracking-tight">
            Home Budget
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded px-2.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
              {l.label}
            </Link>
          ))}
          <div className="ml-auto flex items-center gap-2 text-sm opacity-70">
            <span>{user.name}</span>
            <form action={signOut}>
              <button className="rounded px-2 py-1.5 hover:opacity-100">Sign out</button>
            </form>
          </div>
        </nav>
      </header>

      {/* pb-20 on small screens keeps the last row clear of the fixed nav. */}
      <main className="mx-auto w-full max-w-3xl px-3 pb-20 pt-3 sm:pb-10">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 backdrop-blur sm:hidden dark:border-white/10 dark:bg-ink/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {LINKS.map((l) => (
            <li key={l.href} className="flex-1">
              <Link href={l.href} className="flex h-12 items-center justify-center text-xs font-medium">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
