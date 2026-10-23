import { isValidDate } from "@/lib/dates";
import { MoneyParseError, parseMoney } from "@/lib/money";

/**
 * Reading form posts. Each reader throws a `FormError` carrying the message
 * to show, so an action reads its fields top to bottom and catches once.
 */

export class FormError extends Error {}

export interface FormState {
  error?: string;
  ok?: string;
  /** Set on success, so a form can key on it and reset for the next entry. */
  at?: number;
}

export function text(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}

export function requiredText(data: FormData, key: string, message: string): string {
  const value = text(data, key);
  if (!value) throw new FormError(message);
  return value;
}

export function id(data: FormData, key: string, message: string): number {
  const value = Number(data.get(key));
  if (!Number.isInteger(value) || value <= 0) throw new FormError(message);
  return value;
}

export function date(data: FormData, key: string): string {
  const value = text(data, key);
  if (!isValidDate(value)) throw new FormError("Pick a date.");
  return value;
}

/** An amount in cents. `positive` refuses zero and negatives. */
export function money(data: FormData, key: string, options: { positive?: boolean } = {}): number {
  return amount(text(data, key), options);
}

/** The same reading, for a value already pulled out of a multi-row post. */
export function amount(raw: string, options: { positive?: boolean } = {}): number {
  let cents: number;
  try {
    cents = parseMoney(raw);
  } catch (err) {
    throw new FormError(err instanceof MoneyParseError ? err.message : "Enter an amount.");
  }
  if (options.positive && cents <= 0) throw new FormError("Enter an amount above zero.");
  return cents;
}

/** Same, but blank means null: for optional amounts like a target. */
export function optionalMoney(data: FormData, key: string): number | null {
  return text(data, key) === "" ? null : money(data, key);
}

/**
 * Turn an error into something to show, or rethrow it. Next signals redirects
 * by throwing, so anything that is not ours must keep travelling.
 */
export function failure(err: unknown, known: (new (...args: never[]) => Error)[]): FormState {
  if (err instanceof FormError || known.some((k) => err instanceof k)) {
    return { error: (err as Error).message };
  }
  throw err;
}
