// Maps a database ListingPackage row to the domain type, the only place the row type appears
// (constitution IV): DATE columns become `YYYY-MM-DD` strings and back. The address hash stays
// in the repository.
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { ListingPackage as ListingPackageRow } from "../../generated/prisma/client.js";

export function toListingPackage(row: ListingPackageRow): ListingPackage {
  return {
    id: row.id,
    agentId: row.agentId,
    sellerId: row.sellerId,
    propertyId: row.propertyId,
    status: row.status,
    round: row.round,
    priceExpectationMin: row.priceExpectationMin,
    priceExpectationMax: row.priceExpectationMax,
    closingWindowStart: fromDate(row.closingWindowStart),
    closingWindowEnd: fromDate(row.closingWindowEnd),
    currentlyListed: row.currentlyListed,
    eligiblePrograms: row.eligiblePrograms ?? [],
    offerDeadline: row.offerDeadline,
    publishedAt: row.publishedAt,
    listingVersion: row.listingVersion,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** A DATE column holds midnight UTC; its date part is the stored day. */
const fromDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

export const toDate = (day: string | null) => (day === null ? null : new Date(`${day}T00:00:00Z`));
