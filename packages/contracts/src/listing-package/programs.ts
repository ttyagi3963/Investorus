// Clever's offer programs as one `as const` list (constitution V), matching the Prisma
// `OfferProgram` enum: a package names the ones the seller is open to, and a buy box the ones the
// investor buys through.
export const OFFER_PROGRAMS = ["CASH_OFFER", "CASH_WITH_UPSIDE", "SEVEN_DAY_SOLD"] as const;
export type OfferProgram = (typeof OFFER_PROGRAMS)[number];
