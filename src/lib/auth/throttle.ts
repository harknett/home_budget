import "server-only";

import { headers } from "next/headers";

import { getStore } from "@/lib/db";

/**
 * Slowing down whoever is guessing.
 *
 * Two different attacks need two different limits:
 *
 *   - **One address, many guesses.** Held by the per-IP limit.
 *   - **Many addresses, one account.** A botnet spreads guesses so thinly that
 *     no single address trips anything. Held by the per-account limit, which
 *     counts failures against an email from anywhere.
 *
 * The per-account limit can be used to lock a known person out on purpose, so
 * it is deliberately looser and shorter than the per-address one: an annoyance
 * against a real defence is the right trade only when it expires quickly.
 */

const WINDOW_MINUTES = 15;
const MAX_PER_IP = 10;
const MAX_PER_EMAIL = 20;

/**
 * The caller's address.
 *
 * Behind a reverse proxy the socket address is the proxy, so the forwarded
 * header is used when present. That header is client-supplied and trivially
 * spoofed when the app is exposed directly - which is why the deployment guide
 * insists on binding loopback behind a proxy that overwrites it. A spoofable
 * key makes throttling weaker, not wrong: it still costs an attacker
 * something, and the per-account limit does not depend on it at all.
 */
export async function callerAddress(): Promise<string> {
  const head = await headers();
  const forwarded = head.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return head.get("x-real-ip")?.trim() || "unknown";
}

export interface ThrottleVerdict {
  blocked: boolean;
  message?: string;
}

/**
 * Whether this sign-in attempt should even be tried.
 *
 * The message deliberately does not distinguish "too many attempts from your
 * address" from "too many against this account" - the second would confirm
 * that the account exists.
 */
export async function checkLoginThrottle(email: string): Promise<ThrottleVerdict> {
  const store = getStore();
  store.pruneAttempts();

  const ip = await callerAddress();
  const byIp = store.loginFailuresByIp(ip, WINDOW_MINUTES);
  const byEmail = store.loginFailuresByEmail(email, WINDOW_MINUTES);

  if (byIp >= MAX_PER_IP || byEmail >= MAX_PER_EMAIL) {
    return {
      blocked: true,
      message: `Too many sign-in attempts. Try again in ${WINDOW_MINUTES} minutes.`,
    };
  }
  return { blocked: false };
}

export async function recordLoginFailure(email: string): Promise<void> {
  getStore().recordLoginFailure(await callerAddress(), email);
}

/** A success clears the slate, so a fumbled password is not held against you. */
export async function clearLoginFailures(email: string): Promise<void> {
  getStore().clearLoginFailures(await callerAddress(), email);
}
