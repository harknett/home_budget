"use server";

import { redirect } from "next/navigation";

import { requireSignedIn } from "@/lib/auth/guard";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { endSession, startSession } from "@/lib/auth/session";
import {
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/auth/throttle";
import { getStore } from "@/lib/db";
import { isTimeZone } from "@/lib/dates";

export interface FormState {
  error?: string;
  ok?: string;
}

/**
 * Sign in.
 *
 * One message covers a wrong password, an unknown address and a throttled
 * attempt. Telling them apart would turn the form into a way to ask which
 * email addresses have accounts.
 */
export async function signIn(_prev: FormState, data: FormData): Promise<FormState> {
  const email = String(data.get("email") ?? "").trim();
  const password = String(data.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const throttle = await checkLoginThrottle(email);
  if (throttle.blocked) return { error: throttle.message };

  const user = getStore().findUserByEmail(email);
  // The hash is verified even when no account matched, so a missing account
  // and a wrong password take the same time to answer.
  const decoy = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA";
  const valid = await verifyPassword(password, user?.passwordHash ?? decoy);

  if (!user || !valid) {
    await recordLoginFailure(email);
    return { error: "That email and password do not match." };
  }

  await clearLoginFailures(email);
  await startSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : "/");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}

/**
 * Claim the first account.
 *
 * Only possible while no account exists, and only with the SETUP_TOKEN the
 * operator set. Both halves matter: the count stops it being re-run later, and
 * the token stops whoever finds a fresh deployment first from becoming its
 * owner.
 */
export async function claimOwner(_prev: FormState, data: FormData): Promise<FormState> {
  const store = getStore();
  if (store.countUsers() > 0) return { error: "This app already has an owner." };

  const expected = process.env.SETUP_TOKEN?.trim();
  if (!expected) return { error: "SETUP_TOKEN is not set on the server, so setup is closed." };
  if (String(data.get("token") ?? "").trim() !== expected) {
    return { error: "That setup token is not right." };
  }

  const email = String(data.get("email") ?? "").trim();
  const name = String(data.get("name") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const timeZone = String(data.get("timeZone") ?? "").trim();
  if (!email || !name) return { error: "Enter your name and email." };
  if (!isTimeZone(timeZone)) return { error: "Pick a time zone." };

  try {
    validatePassword(password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That password will not do." };
  }

  const user = store.createUser({
    email,
    name,
    passwordHash: await hashPassword(password),
    role: "owner",
    timeZone,
    mustChangePassword: false,
  });
  await startSession(user.id);
  redirect("/");
}

export async function changePassword(_prev: FormState, data: FormData): Promise<FormState> {
  const user = await requireSignedIn();
  const current = String(data.get("current") ?? "");
  const next = String(data.get("next") ?? "");
  const confirm = String(data.get("confirm") ?? "");

  const store = getStore();
  const record = store.findUserByEmail(user.email);
  if (!record || !(await verifyPassword(current, record.passwordHash))) {
    return { error: "That is not your current password." };
  }
  if (next !== confirm) return { error: "The new passwords do not match." };
  if (next === current) return { error: "Choose a password you have not just used." };

  try {
    validatePassword(next);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That password will not do." };
  }

  store.setPassword(user.id, await hashPassword(next), false);
  // Every other session for this account goes with the old password - that is
  // the point of changing it after somebody else set one.
  store.deleteUserSessions(user.id);
  await startSession(user.id);
  redirect("/");
}
