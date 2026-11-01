// The listing version port over Prisma (T288): the only file with ListingVersion queries. The
// snapshot is our own JSON, written by toListingFacts, so it is read back as ListingFacts.
import type { Prisma } from "../../generated/prisma/client.js";
import type { ListingFacts } from "../../registry/listing-facts.js";
import type {
  IListingVersionRepository,
  ListingVersionRecord,
} from "./IListingVersionRepository.js";

export class PrismaListingVersionRepositoryImpl implements IListingVersionRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async append(version: ListingVersionRecord): Promise<void> {
    await this.db.listingVersion.create({
      data: { ...version, snapshot: version.snapshot as Prisma.InputJsonObject },
    });
  }

  async find(packageId: string, listingVersion: number): Promise<ListingVersionRecord | null> {
    const row = await this.db.listingVersion.findUnique({
      where: { packageId_listingVersion: { packageId, listingVersion } },
    });
    if (!row) return null;
    return {
      packageId: row.packageId,
      listingVersion: row.listingVersion,
      round: row.round,
      snapshot: row.snapshot as ListingFacts,
      evaluatorVersion: row.evaluatorVersion,
    };
  }
}
