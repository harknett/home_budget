import Link from "next/link";

import { Money } from "@/components/ui";

/**
 * The one number that is always in view: money that has arrived and not yet
 * been given a job. Sticky, so it stays put while the envelope list scrolls.
 */
export function UnallocatedBar({ cents, plansDue }: { cents: number; plansDue: number }) {
  return (
    <div className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-3 border-b border-rule bg-paper/95 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-ink/95">
      <div className="text-sm">
        <span className="opacity-70">Unallocated </span>
        <Money cents={cents} className="font-semibold" />
      </div>
      <Link
        href="/fund"
        className="ml-auto rounded bg-ink px-2.5 py-1 text-xs font-medium text-paper dark:bg-paper dark:text-ink"
      >
        {plansDue > 0 ? `Fund · ${plansDue} plan${plansDue === 1 ? "" : "s"} due` : "Fund"}
      </Link>
    </div>
  );
}
