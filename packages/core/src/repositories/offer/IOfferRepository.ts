// The offer port (T296; FR-042): an investor's offer on a package in one round, at its latest
// revision. Every set of terms is kept as an append-only revision, and a stale revise is refused.
// Withdrawing a package declines its open offers (T291).
import type { Offer, OfferTerms } from "@clever/contracts/offer";

export type NewOffer = OfferTerms & { packageId: string; investorId: string; round: number };

export interface IOfferRepository {
  /**
   * Creates the offer and its revision 1. Throws BusinessRuleError OFFER_EXISTS when the investor
   * already has an ACTIVE offer in the round (the partial unique index, so a race cannot add two).
   */
  create(offer: NewOffer): Promise<Offer>;
  findById(id: string): Promise<Offer | null>;
  /** The investor's offer in the round, ACTIVE first, then the newest. */
  findLatest(packageId: string, investorId: string, round: number): Promise<Offer | null>;
  listByPackage(packageId: string, round: number): Promise<Offer[]>;
  /**
   * Replaces the terms and writes the next revision, only if the stored version is `version`;
   * otherwise throws ConflictError.
   */
  revise(id: string, version: number, terms: OfferTerms): Promise<Offer>;
  /** Declines every ACTIVE offer on the package in the round; returns how many. */
  declineOpen(packageId: string, round: number): Promise<number>;
}
