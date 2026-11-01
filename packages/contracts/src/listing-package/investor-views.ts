// What a matched investor sees of a package (T295; SC-006, XX.1, contracts/api.md): the place by
// city, state, and ZIP, the facts, the photos, the price range, the deadline, and their own offer.
// Each view names its fields, so the seller and the street can never reach an investor by accident.
import { toOfferView, type Offer, type OfferStatus, type OfferView } from "../offer/offer.js";
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
  };
}

export function toInvestorPackageSummary(parts: InvestorPackageParts): InvestorPackageSummary {
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
