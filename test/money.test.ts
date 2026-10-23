import { describe, expect, it } from "vitest";

import { MoneyParseError, formatMoney, formatSigned, parseMoney } from "@/lib/money";

describe("parseMoney", () => {
  it("reads whole and fractional amounts into cents", () => {
    expect(parseMoney("12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("12.05")).toBe(1205);
    expect(parseMoney(".99")).toBe(99);
  });

  it("ignores currency symbols, separators and spaces", () => {
    expect(parseMoney("$1,234.56")).toBe(123_456);
    expect(parseMoney(" 1 000 ")).toBe(100_000);
  });

  it("reads negatives, including accounting brackets", () => {
    expect(parseMoney("-40")).toBe(-4000);
    expect(parseMoney("(40.00)")).toBe(-4000);
    expect(parseMoney("$-1.50")).toBe(-150);
    expect(parseMoney("+3")).toBe(300);
  });

  it("refuses what is not an amount rather than guessing", () => {
    for (const bad of ["", "abc", "1.234", "1.2.3", ".", "-"]) {
      expect(() => parseMoney(bad), bad).toThrow(MoneyParseError);
    }
  });

  it("never goes through a float", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in cents it is exact.
    expect(parseMoney("0.10") + parseMoney("0.20")).toBe(parseMoney("0.30"));
    expect(parseMoney("19.99")).toBe(1999);
  });
});

describe("formatMoney", () => {
  it("renders cents with two places and thousands separators", () => {
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney(5)).toBe("0.05");
    expect(formatMoney(123_456)).toBe("1,234.56");
    expect(formatMoney(-4000)).toBe("-40.00");
  });

  it("round-trips through parseMoney", () => {
    for (const cents of [0, 1, 99, 100, 123_456, -987_654_321]) {
      expect(parseMoney(formatMoney(cents))).toBe(cents);
    }
  });

  it("marks positive movements with a plus", () => {
    expect(formatSigned(500)).toBe("+5.00");
    expect(formatSigned(-500)).toBe("-5.00");
    expect(formatSigned(0)).toBe("0.00");
  });
});
