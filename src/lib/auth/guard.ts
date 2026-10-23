import "server-only";

import { redirect } from "next/navigation";

import type { User } from "@/lib/db/types";

import { currentUser } from "./session";

/**
 * The gate every page and action passes through: signed in, and holding a
 * password of their own. An account still carrying one somebody else set is
 * held at /change-password until it picks its own.
 *
 * The check lives here rather than only in the layout so a Server Action
 * cannot be posted around it.
 */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/**
 * Signed in, without the must-change gate. Only for the change-password flow
 * itself and for signing out.
 */
export async function requireSignedIn(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Managing logins is the owner's job; the budget itself is everyone's. */
export async function requireOwner(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}
