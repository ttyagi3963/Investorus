// The ListingPackage the app passes around, shaped from the Prisma model, with the closing window
// as `YYYY-MM-DD` dates (no time zone can shift a seller's date). addressHash stays in the
// repository (it only backs the duplicate-address block).
import type { OfferProgram } from "./programs.js";

/** data-model.md, PackageStatus: from OFFER_ACCEPTED on, the status mirrors the active deal. */
export const PACKAGE_STATUSES = [
  "DRAFT",
  "ACCEPTING_OFFERS",
  "NO_OFFERS_RECEIVED",
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
  "FELL_THROUGH",
  "WITHDRAWN",
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export type ListingPackage = {
  id: string;
  agentId: string;
  sellerId: string;
  propertyId: string;
  status: PackageStatus;
  /** 1, and +1 each time the package is reopened. */
  round: number;
  priceExpectationMin: number;
  priceExpectationMax: number;
  closingWindowStart: string | null;
  closingWindowEnd: string | null;
  currentlyListed: boolean | null;
  eligiblePrograms: OfferProgram[];
  offerDeadline: Date | null;
  publishedAt: Date | null;
  /** 0 while a draft, 1 at publish, +1 on each material edit and on reopen. */
  listingVersion: number;
  /** Optimistic concurrency: an update names the version it read (T243). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
