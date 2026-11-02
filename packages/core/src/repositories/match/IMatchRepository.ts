// The match port (T288): an investor's access to a package in one round (FR-022, FR-040). A match
// is created once and keeps every box that matched across the round's listing versions.
import type { Match, MatchTrigger } from "@clever/contracts/match";

export type MatchUpsert = {
  packageId: string;
  investorId: string;
  round: number;
  matchedBuyBoxIds: string[];
  /** Kept only when the match is created. */
  trigger: MatchTrigger;
};

export interface IMatchRepository {
  /** Creates the match, or adds the boxes to the existing one; says whether it was created. */
  upsert(match: MatchUpsert): Promise<{ match: Match; created: boolean }>;
  /** Records the listing version the investor was last told about. */
  markNotified(id: string, listingVersion: number): Promise<void>;
  listByPackage(packageId: string, round: number): Promise<Match[]>;
  /** How many investors the package matched in the round. */
  countByPackage(packageId: string, round: number): Promise<number>;
  /** The investor's access to the package in the round (FR-040), or null. */
  findOne(packageId: string, investorId: string, round: number): Promise<Match | null>;
  /** Every match of the investor, newest first. */
  listForInvestor(investorId: string): Promise<Match[]>;
  /**
   * Marks digested at `at` every buy-box-change match not yet sent in a daily digest (FR-023) and
   * returns them, oldest first. One statement, so of two runs at once each match goes to one (T379).
   */
  claimUndigested(at: Date): Promise<Match[]>;
}
