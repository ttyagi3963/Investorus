// The buy box port (T288, T321). Stage 1 of matching (FR-020, FR-024) returns every box that could
// match a listing, never fewer: the hard cuts (box ACTIVE, investor ACTIVE, proof of funds not
// expired) and geography only; stage 2, the evaluator, decides every criterion. An investor's own
// boxes are read and saved here too (FR-060); a save names the version it read, and each version
// is kept as a snapshot.
import type { BuyBox, BuyBoxInput } from "@clever/contracts/buy-box";

export interface IBuyBoxRepository {
  /** ACTIVE boxes of ACTIVE investors with proof of funds after `now`, covering the ZIP or state. */
  listCandidates(zip: string, state: string, now: Date): Promise<BuyBox[]>;
  /** The investor's boxes, the default first, then oldest first. */
  listForInvestor(investorId: string): Promise<BuyBox[]>;
  findById(id: string): Promise<BuyBox | null>;
  /** The investor's default box, the one the legacy import keeps, or null. */
  findDefault(investorId: string): Promise<BuyBox | null>;
  /**
   * The box at exactly this version, if it can match now: ACTIVE, of an ACTIVE investor whose
   * proof of funds runs past `now`. Otherwise null.
   */
  findMatchable(id: string, version: number, now: Date): Promise<BuyBox | null>;
  /** A new box at version 1; a name the investor already uses is a ValidationError on `name`. */
  create(investorId: string, box: BuyBoxInput, isDefault?: boolean): Promise<BuyBox>;
  /**
   * Replaces every field and the geography and moves the version, if the box is still at `version`;
   * otherwise ConflictError. A name the investor already uses is a ValidationError on `name`.
   */
  update(id: string, version: number, box: BuyBoxInput): Promise<BuyBox>;
  /** Keeps the box as saved, as its version's snapshot; `createdBy` is null for the system. */
  appendVersion(box: BuyBox, createdBy: string | null): Promise<void>;
}
