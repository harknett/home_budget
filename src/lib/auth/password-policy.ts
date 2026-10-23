/**
 * Password rules shared by the browser and the server.
 *
 * Free of Node imports so a client component can show the requirement as
 * somebody types. Hashing lives in password.ts, which is server-only.
 */

export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 1024;

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error("Password is too long.");
}
