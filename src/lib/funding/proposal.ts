import type { FundingPlanLine } from "@/lib/db/types";

/**
 * What a plan would put in each envelope right now.
 *
 *   - **fixed**: the amount, every run.
 *   - **top_up**: whatever brings the envelope up to its target, never past
 *     it, and capped at the line's amount when that is above zero. An envelope
 *     already at target gets nothing; one with no target gets nothing.
 *
 * The result is only a suggestion: the Fund screen prefills it and the
 * person decides.
 */
export function proposeAmounts(
  lines: FundingPlanLine[],
  envelopes: Map<number, { balance: number; targetCents: number | null }>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of lines) {
    const envelope = envelopes.get(line.envelopeId);
    if (!envelope) continue;
    let amount: number;
    if (line.rule === "fixed") {
      amount = line.amountCents;
    } else {
      const gap = envelope.targetCents === null ? 0 : Math.max(0, envelope.targetCents - envelope.balance);
      amount = line.amountCents > 0 ? Math.min(gap, line.amountCents) : gap;
    }
    if (amount > 0) out.set(line.envelopeId, amount);
  }
  return out;
}
