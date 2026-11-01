// Maps a database ListingPackage row to the domain type, the only place the row type appears
// (constitution IV). The address hash stays in the repository.
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { ListingPackage as ListingPackageRow } from "../../generated/prisma/client.js";

export function toListingPackage(row: ListingPackageRow): ListingPackage {
  return {
    id: row.id,
    agentId: row.agentId,
    sellerId: row.sellerId,
    propertyId: row.propertyId,
    status: row.status,
    priceExpectationMin: row.priceExpectationMin,
    priceExpectationMax: row.priceExpectationMax,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
