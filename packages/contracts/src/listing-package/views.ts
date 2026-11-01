// What the agent's package responses show (T257, contracts/api.md): the full package with its seller
// and property for GET/POST/PATCH, and a short summary for the list. Each view names its fields, so
// nothing added to the domain types later reaches a response by accident; photos carry a short-lived
// read link instead of their storage key.
import type { Photo } from "../photo/photo.js";
import type { Property } from "../property/property.js";
import type { Seller } from "../seller/seller.js";
import type { ListingPackage, PackageStatus } from "./listing-package.js";

export type AgentPackageParts = {
  package: ListingPackage;
  seller: Seller;
  property: Property;
  photos: Photo[];
};

/** The parts with each photo's read link already signed (signing is async; this mapper is not). */
export type SignedAgentPackageParts = Omit<AgentPackageParts, "photos"> & {
  photos: (Photo & { url: string })[];
};

export type AgentPackageView = {
  id: string;
  status: PackageStatus;
  version: number;
  priceExpectationMin: number;
  priceExpectationMax: number;
  seller: Pick<Seller, "fullName" | "email" | "phone">;
  property: Omit<Property, "id" | "createdAt" | "updatedAt">;
  photos: { id: string; position: number; contentType: string; sizeBytes: number; url: string }[];
  createdAt: string;
  updatedAt: string;
};

export type AgentPackageSummary = {
  id: string;
  status: PackageStatus;
  streetLine: string;
  city: string;
  state: string;
  zip: string;
  priceExpectationMin: number;
  priceExpectationMax: number;
  photoCount: number;
  updatedAt: string;
};

export function toAgentPackageView(parts: SignedAgentPackageParts): AgentPackageView {
  const { package: pkg, seller, property: p, photos } = parts;
  return {
    id: pkg.id,
    status: pkg.status,
    version: pkg.version,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
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

export function toAgentPackageSummary(parts: AgentPackageParts): AgentPackageSummary {
  const { package: pkg, property } = parts;
  return {
    id: pkg.id,
    status: pkg.status,
    streetLine: property.streetLine,
    city: property.city,
    state: property.state,
    zip: property.zip,
    priceExpectationMin: pkg.priceExpectationMin,
    priceExpectationMax: pkg.priceExpectationMax,
    photoCount: parts.photos.length,
    updatedAt: pkg.updatedAt.toISOString(),
  };
}
