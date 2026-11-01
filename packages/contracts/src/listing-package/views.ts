// What the agent's package responses show (T257, contracts/api.md): the full package with its seller
// and property for GET/POST/PATCH, and a short summary for the list. Each view names its fields, so
// nothing added to the domain types later reaches a response by accident; photos carry their public
// address instead of their storage key.
import type { Photo } from "../photo/photo.js";
import type { Property } from "../property/property.js";
import type { Seller } from "../seller/seller.js";
import type { ListingPackage, PackageStatus } from "./listing-package.js";
import type { OfferProgram } from "./programs.js";
import type { CriterionKey } from "../buy-box/criteria.js";

export type AgentPackageParts = {
  package: ListingPackage;
  seller: Seller;
  property: Property;
  photos: Photo[];
  /** How many investors the package matched in its current round. */
  matchedCount: number;
  /** What the last matching run weighed, as counts; null before the package was matched. */
  matchSummary: MatchSummary | null;
};

/**
 * How a package fared in matching (T343; design 04): how many eligible buy boxes were weighed, and
 * the criteria the others failed most often, with how many boxes failed each. Counts only: never
 * which investor or box (XII).
 */
export type MatchSummary = {
  evaluated: number;
  reasons: { key: CriterionKey; label: string; count: number }[];
};

/** The parts with each photo's public address, which only storage knows, already added. */
export type AgentPackagePartsWithUrls = Omit<AgentPackageParts, "photos"> & {
  photos: (Photo & { url: string })[];
};

export type AgentPackageView = {
  id: string;
  status: PackageStatus;
  version: number;
  round: number;
  listingVersion: number;
  priceExpectationMin: number;
  priceExpectationMax: number;
  closingWindowStart: string | null;
  closingWindowEnd: string | null;
  currentlyListed: boolean | null;
  eligiblePrograms: OfferProgram[];
  offerDeadline: string | null;
  publishedAt: string | null;
  matchedCount: number;
  matchSummary: MatchSummary | null;
  seller: Pick<Seller, "fullName" | "email" | "phone">;
  property: Omit<Property, "id" | "createdAt" | "updatedAt">;
  photos: { id: string; position: number; contentType: string; sizeBytes: number; url: string }[];
  createdAt: string;
  updatedAt: string;
};

export type AgentPackageSummary = {
  id: string;
  status: PackageStatus;
  /** What a publish or withdraw from the list names (optimistic concurrency). */
  version: number;
  streetLine: string;
  city: string;
  state: string;
  zip: string;
  priceExpectationMin: number;
  priceExpectationMax: number;
  offerDeadline: string | null;
  photoCount: number;
  /** The first photo's address, for the list's thumbnail; null without photos. */
  photoUrl: string | null;
  matchedCount: number;
  updatedAt: string;
};

export function toAgentPackageView(parts: AgentPackagePartsWithUrls): AgentPackageView {
  const { package: pkg, seller, property: p, photos } = parts;
  return {
    id: pkg.id,
    status: pkg.status,
    version: pkg.version,
    round: pkg.round,
    listingVersion: pkg.listingVersion,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
    closingWindowStart: pkg.closingWindowStart,
    closingWindowEnd: pkg.closingWindowEnd,
    currentlyListed: pkg.currentlyListed,
    eligiblePrograms: pkg.eligiblePrograms,
    offerDeadline: pkg.offerDeadline?.toISOString() ?? null,
    publishedAt: pkg.publishedAt?.toISOString() ?? null,
    matchedCount: parts.matchedCount,
    matchSummary: parts.matchSummary,
    seller: { fullName: seller.fullName, email: seller.email, phone: seller.phone },
    property: {
      streetLine: p.streetLine,
      zip: p.zip,
      city: p.city,
      state: p.state,
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
    },
    photos: [...photos]
      .sort((a, b) => a.position - b.position)
      .map((photo) => ({
        id: photo.id,
        position: photo.position,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
        url: photo.url,
      })),
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

export function toAgentPackageSummary(parts: AgentPackagePartsWithUrls): AgentPackageSummary {
  const { package: pkg, property } = parts;
  const first = [...parts.photos].sort((a, b) => a.position - b.position)[0];
  return {
    id: pkg.id,
    status: pkg.status,
    version: pkg.version,
    streetLine: property.streetLine,
    city: property.city,
    state: property.state,
    zip: property.zip,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
    offerDeadline: pkg.offerDeadline?.toISOString() ?? null,
    photoCount: parts.photos.length,
    photoUrl: first?.url ?? null,
    matchedCount: parts.matchedCount,
    updatedAt: pkg.updatedAt.toISOString(),
  };
}
