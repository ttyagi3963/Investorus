// The Match the app passes around, shaped from the Prisma `Match` model (T281): an investor's
// access to a package in one offer round, created when one of their buy boxes matches (FR-022).

export const MATCH_TRIGGERS = ["PUBLISH", "PACKAGE_EDIT"] as const;
export type MatchTrigger = (typeof MATCH_TRIGGERS)[number];

export type Match = {
  id: string;
  packageId: string;
  investorId: string;
  round: number;
  /** Every buy box of this investor that matched, across the round's listing versions. */
  matchedBuyBoxIds: string[];
  trigger: MatchTrigger;
  firstMatchedAt: Date;
  /** The listing version the investor was last told about. */
  lastNotifiedListingVersion: number | null;
};
