// What a matched investor sees of a package (T295; SC-006, XX.1, contracts/api.md): the place by
// city, state, and ZIP, the facts, the photos, the price range, the deadline, and their own offer,
// with their own last terms beside an agent's counter (T377).
// Each view names its fields, so the seller and the street can never reach an investor by accident.
// Only the winning investor gets the seller's contact and the street, through a separate view
// (T312; FR-031), so the everyday view's type can never carry them.
import type { Deal, DealStatus } from "../deal/deal.js";
import {
  toOfferView,
  type Offer,
  type OfferStatus,
  type OfferTerms,
  type OfferView,
} from "../offer/offer.js";
import type { Photo } from "../photo/photo.js";
import type { Property } from "../property/property.js";
import type { ListingPackage, PackageStatus } from "./listing-package.js";
import type { OfferProgram } from "./programs.js";

export type InvestorPackageParts = {
  package: ListingPackage;
  property: Property;
  photos: (Photo & { url: string })[];
  /** The investor's offer in the package's current round, if any. */
  myOffer: Offer | null;
  /** The investor's own last terms while an agent's counter stands in for them, else null. */
  myOwnTerms: OfferTerms | null;
  /** The deal on the investor's own offer, if their offer was accepted or promoted. */
  myDeal: Pick<Deal, "status" | "reconfirmBy"> | null;
  matchedAt: Date;
};

export type InvestorPackageView = {
  id: string;
  status: PackageStatus;
  round: number;
  listingVersion: number;
  city: string;
  state: string;
  zip: string;
  neighborhood: string | null;
  propertyType: Property["propertyType"];
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  units: number | null;
  yearBuilt: number | null;
  condition: Property["condition"];
  repairEstimate: number | null;
  priceExpectationMin: number;
  priceExpectationMax: number;
  closingWindowStart: string | null;
  closingWindowEnd: string | null;
  currentlyListed: boolean | null;
  eligiblePrograms: OfferProgram[];
  offerDeadline: string | null;
  photos: { id: string; position: number; url: string }[];
  myOffer: OfferView | null;
  /** What declining a counter goes back to: the investor's own last terms (FR-052). */
  myOwnTerms: (Omit<OfferTerms, "expiresAt"> & { expiresAt: string }) | null;
  /** The buyer's milestone, or a promoted backup's time to reconfirm (FR-055, FR-057). */
  myDeal: { status: DealStatus; reconfirmBy: string | null } | null;
};

/** What only the winning investor sees on top: the seller's contact and the street (FR-031). */
export type WinningInvestorPackageView = InvestorPackageView & {
  sellerContact: { fullName: string; email: string | null; phone: string | null };
  streetLine: string;
};

export type InvestorPackageSummary = {
  id: string;
  status: PackageStatus;
  city: string;
  state: string;
  zip: string;
  propertyType: Property["propertyType"];
  priceExpectationMin: number;
  priceExpectationMax: number;
  offerDeadline: string | null;
  photoUrl: string | null;
  myOfferStatus: OfferStatus | null;
  matchedAt: string;
};

export function toInvestorPackageView(parts: InvestorPackageParts): InvestorPackageView {
  const { package: pkg, property: p } = parts;
  return {
    id: pkg.id,
    status: pkg.status,
    round: pkg.round,
    listingVersion: pkg.listingVersion,
    city: p.city,
    state: p.state,
    zip: p.zip,
    neighborhood: p.neighborhood,
    propertyType: p.propertyType,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    lotSqft: p.lotSqft,
    units: p.units,
    yearBuilt: p.yearBuilt,
    condition: p.condition,
    repairEstimate: p.repairEstimate,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
    closingWindowStart: pkg.closingWindowStart,
    closingWindowEnd: pkg.closingWindowEnd,
    currentlyListed: pkg.currentlyListed,
    eligiblePrograms: pkg.eligiblePrograms,
    offerDeadline: pkg.offerDeadline?.toISOString() ?? null,
    photos: [...parts.photos]
      .sort((a, b) => a.position - b.position)
      .map((photo) => ({ id: photo.id, position: photo.position, url: photo.url })),
    myOffer: parts.myOffer ? toOfferView(parts.myOffer) : null,
    myOwnTerms: parts.myOwnTerms && {
      ...parts.myOwnTerms,
      expiresAt: parts.myOwnTerms.expiresAt.toISOString(),
    },
    myDeal: parts.myDeal && {
      status: parts.myDeal.status,
      reconfirmBy: parts.myDeal.reconfirmBy?.toISOString() ?? null,
    },
  };
}

/**
 * GET /investor/packages/:id: the everyday view, plus the seller's contact and the street only when
 * the service set `seller` (the winning investor's read, already audited).
 */
export function toInvestorPackageResponse(
  parts: InvestorPackageParts & { seller?: WinningInvestorPackageView["sellerContact"] },
): InvestorPackageView | WinningInvestorPackageView {
  const view = toInvestorPackageView(parts);
  if (!parts.seller) return view;
  const { fullName, email, phone } = parts.seller;
  return {
    ...view,
    sellerContact: { fullName, email, phone },
    streetLine: parts.property.streetLine,
  };
}

/** The list row needs no deal or counter terms, so the list does not read them (T386). */
export function toInvestorPackageSummary(
  parts: Omit<InvestorPackageParts, "myOwnTerms" | "myDeal">,
): InvestorPackageSummary {
  const { package: pkg, property: p } = parts;
  const first = [...parts.photos].sort((a, b) => a.position - b.position)[0];
  return {
    id: pkg.id,
    status: pkg.status,
    city: p.city,
    state: p.state,
    zip: p.zip,
    propertyType: p.propertyType,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
    offerDeadline: pkg.offerDeadline?.toISOString() ?? null,
    photoUrl: first?.url ?? null,
    myOfferStatus: parts.myOffer?.status ?? null,
    matchedAt: parts.matchedAt.toISOString(),
  };
}
