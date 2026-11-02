// The offer port (T296; FR-042): an investor's offer on a package in one round, at its latest
// revision. Every set of terms is kept as an append-only revision, and a stale revise is refused.
// Withdrawing a package declines its open offers (T291); timers and decisions move an offer's status
// (T306).

/** The statuses that hold the investor's one place on a package in a round (FR-042). */
export const LIVE_OFFER_STATUSES: OfferStatus[] = ["ACTIVE", "COUNTERED", "BACKUP", "ACCEPTED"];

/** The offers still waiting on the seller's decision, which a withdrawal or a reopen declines. */
export const OPEN_OFFER_STATUSES: OfferStatus[] = ["ACTIVE", "COUNTERED", "BACKUP"];
import type { Offer, OfferStatus, OfferTerms, RevisionAuthor } from "@clever/contracts/offer";

export type NewOffer = OfferTerms & { packageId: string; investorId: string; round: number };

/** Who writes a revision (an agent's is a counter) and the status the offer takes with it. */
export type RevisionOptions = { author?: RevisionAuthor; status?: OfferStatus };

export interface IOfferRepository {
  /**
   * Creates the offer and its revision 1. Throws BusinessRuleError OFFER_EXISTS when the investor
   * already has a live offer in the round (the partial unique index, so a race cannot add two).
   */
  create(offer: NewOffer): Promise<Offer>;
  findById(id: string): Promise<Offer | null>;
  /** The investor's live offer in the round, or else their newest one. */
  findLatest(packageId: string, investorId: string, round: number): Promise<Offer | null>;
  /** The same for each package at its own round, in one query (T399); none is absent. */
  findLatestForInvestor(
    investorId: string,
    packages: { id: string; round: number }[],
  ): Promise<Map<string, Offer>>;
  listByPackage(packageId: string, round: number): Promise<Offer[]>;
  /**
   * Replaces the terms and writes the next revision (by the investor unless `author` says the
   * agent), optionally moving the offer to `status`, only if the stored version is `version`;
   * otherwise throws ConflictError.
   */
  revise(id: string, version: number, terms: OfferTerms, options?: RevisionOptions): Promise<Offer>;
  /** The terms of the newest revision `author` wrote, or null. */
  findLastTerms(offerId: string, author: RevisionAuthor): Promise<OfferTerms | null>;
  /**
   * Moves the offer to `status`, only if the stored version is `version`; otherwise throws
   * ConflictError.
   */
  updateStatus(id: string, version: number, status: OfferStatus): Promise<Offer>;
  /** Declines every open offer (ACTIVE, COUNTERED, BACKUP) on the package in the round; returns them. */
  declineOpen(packageId: string, round: number): Promise<Offer[]>;
}
