"use client";

import { useActionState, useState } from "react";

import { removeEntry } from "@/app/(app)/entry-actions";
import type { FormState } from "@/lib/forms";

/**
 * Delete with a second tap. Deleting removes both sides of the entry — the
 * account line and every envelope it touched — so it asks once more.
 */
export function DeleteEntry({ entryId }: { entryId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeEntry, {});
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="text-xs underline opacity-60">
        Delete
      </button>
    );
  }
  return (
    <form action={action} className="inline-flex items-center gap-2 text-xs">
      <input type="hidden" name="entryId" value={entryId} />
      <button disabled={pending} className="font-medium text-short underline">
        Delete it, both sides
      </button>
      <button type="button" onClick={() => setArmed(false)} className="underline opacity-60">
        Keep
      </button>
      {state.error ? <span className="text-short">{state.error}</span> : null}
    </form>
  );
}
