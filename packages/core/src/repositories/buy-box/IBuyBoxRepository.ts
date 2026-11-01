// The buy box port (T288): stage 1 of matching (FR-020, FR-024). It returns every box that could
// match a listing, never fewer: the hard cuts (box ACTIVE, investor ACTIVE, proof of funds not
// expired) and geography only. Stage 2, the evaluator, decides every criterion.
import type { BuyBox } from "@clever/contracts/buy-box";

export interface IBuyBoxRepository {
  /** ACTIVE boxes of ACTIVE investors with proof of funds after `now`, covering the ZIP or state. */
  listCandidates(zip: string, state: string, now: Date): Promise<BuyBox[]>;
}
