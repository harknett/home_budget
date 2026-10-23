"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { failure, id, type FormState } from "@/lib/forms";

/** Delete an entry, both sides at once. Reconciled entries are refused. */
export async function removeEntry(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  try {
    getStore().deleteEntry(id(data, "entryId", "No such entry."));
    revalidatePath("/", "layout");
    return { ok: "Deleted.", at: Date.now() };
  } catch (err) {
    return failure(err, [LedgerError]);
  }
}

/** Flip a register line between cleared and uncleared. */
export async function toggleCleared(data: FormData): Promise<void> {
  await requireUser();
  const lineId = Number(data.get("lineId"));
  const cleared = data.get("cleared") === "1";
  try {
    getStore().setLineStatus(lineId, cleared ? "uncleared" : "cleared");
  } catch (err) {
    // A reconciled line is locked; the button is not shown for one, so a
    // refusal here is a stale page and simply refreshing it is the answer.
    if (!(err instanceof LedgerError)) throw err;
  }
  revalidatePath("/", "layout");
}
