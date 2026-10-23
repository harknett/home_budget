/**
 * Money as whole cents.
 *
 * Every amount in the app is an integer number of cents, stored, summed and
 * compared as one. Floats are never used for money: 0.1 + 0.2 is not 0.3, and
 * a budget that is out by a cent after a year of transactions is a budget
 * nobody trusts. Dollars are a rendering, converted at the boundary — form
 * input and file import — and nowhere else.
 */

export class MoneyParseError extends Error {}

/**
 * Read a typed amount into cents.
 *
 * Accepts what people and bank exports actually write: `12`, `12.5`,
 * `$1,234.56`, `-40`, and accounting-style `(40.00)` for a negative. More than
 * two decimal places is refused rather than rounded — a typo is likelier than
 * a fraction of a cent.
 */
export function parseMoney(input: string): number {
  let text = input.trim().replace(/[$,\s]/g, "");
  if (text === "") throw new MoneyParseError("Enter an amount.");

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) {
    throw new MoneyParseError(`Not an amount: ${input}`);
  }
  const whole = Number(match[1] || "0");
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) throw new MoneyParseError("That amount is too large.");
  return negative ? -cents : cents;
}

/** `123456` → `1,234.56`; negatives keep a leading minus. */
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Like `formatMoney`, with an explicit `+` on positives, for movements. */
export function formatSigned(cents: number): string {
  return cents > 0 ? `+${formatMoney(cents)}` : formatMoney(cents);
}
