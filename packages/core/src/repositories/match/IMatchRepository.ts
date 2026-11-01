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
}
