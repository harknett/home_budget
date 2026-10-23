"use server";

import { revalidatePath } from "next/cache";

import { requireOwner, requireUser } from "@/lib/auth/guard";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { getStore } from "@/lib/db";
import { LedgerError } from "@/lib/db/store";
import { isTimeZone } from "@/lib/dates";
import { FormError, failure, id, requiredText, text, type FormState } from "@/lib/forms";

export async function saveTimeZone(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const zone = text(data, "timeZone");
    if (!isTimeZone(zone)) throw new FormError("That is not a time zone this server knows, e.g. America/Chicago.");
    getStore().setTimeZone(user.id, zone);
    revalidatePath("/", "layout");
    return { ok: "Saved.", at: Date.now() };
  } catch (err) {
    return failure(err, []);
  }
}

/**
 * Add a login for someone in the household. They get a one-time password to
 * be read out or written down, and must replace it when they first sign in.
 */
export async function addMember(_prev: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  try {
    const store = getStore();
    const name = requiredText(data, "name", "Enter their name.");
    const email = requiredText(data, "email", "Enter their email.");
    if (store.findUserByEmail(email)) throw new FormError("That email already has a login.");
    const role = data.get("role") === "owner" ? "owner" : "member";
    const temporary = generateTemporaryPassword();
    store.createUser({
      name,
      email,
      role,
      timeZone: owner.timeZone,
      passwordHash: await hashPassword(temporary),
      mustChangePassword: true,
    });
    revalidatePath("/settings");
    return { ok: `${name} can sign in as ${email} with ${temporary} — they pick their own password then.`, at: Date.now() };
  } catch (err) {
    return failure(err, []);
  }
}

export async function removeMember(_prev: FormState, data: FormData): Promise<FormState> {
  const owner = await requireOwner();
  try {
    const memberId = id(data, "id", "No such login.");
    if (memberId === owner.id) throw new FormError("You cannot remove your own login.");
    getStore().deleteUser(memberId);
    revalidatePath("/settings");
    return { ok: "Removed. Everything they entered stays.", at: Date.now() };
  } catch (err) {
    return failure(err, [LedgerError]);
  }
}
