import "server-only";

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { MIN_PASSWORD_LENGTH, validatePassword } from "./password-policy";

// Re-exported so server code has one import site. Client components must take
// these from ./password-policy - node:crypto is empty in the browser.
export { MIN_PASSWORD_LENGTH, validatePassword };

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// Cost parameters are stored with each hash, so raising them later invalidates
// nothing already written.
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Encoded as `scrypt$N$r$p$salt$hash`, both binary parts base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const options = { N: Number(nRaw), r: Number(rRaw), p: Number(pRaw) };
  if (!Number.isInteger(options.N) || !Number.isInteger(options.r) || !Number.isInteger(options.p)) {
    return false;
  }

  const expected = Buffer.from(hashB64, "base64");
  const derived = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    expected.length,
    options,
  );
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Characters for a temporary password: no i, l, 1, o or 0, because these get
 * read out across a kitchen or written on a scrap of paper.
 */
const READABLE = "abcdefghjkmnpqrstuvwxyz23456789";

/** A one-time password for a new account or a reset. About 59 bits. */
export function generateTemporaryPassword(): string {
  const chars = Array.from({ length: 12 }, () => READABLE[randomInt(READABLE.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join("")).join("-");
}
