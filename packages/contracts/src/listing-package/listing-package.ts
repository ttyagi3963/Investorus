// The ListingPackage the app passes around, shaped from the Prisma model. Sprint 1 packages are
// drafts; the other statuses and the publish fields arrive with publishing. addressHash stays in
// the repository (it only backs the duplicate-address block).

export const PACKAGE_STATUSES = ["DRAFT"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export type ListingPackage = {
  id: string;
  agentId: string;
  sellerId: string;
  propertyId: string;
  status: PackageStatus;
  priceExpectationMin: number;
  priceExpectationMax: number;
  /** Optimistic concurrency: an update names the version it read (T243). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
