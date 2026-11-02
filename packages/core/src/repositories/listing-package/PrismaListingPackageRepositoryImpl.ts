// The listing-package port over Prisma (T247): the only file with ListingPackage queries.
import { ConflictError } from "@clever/contracts/common";
import { ADDRESS_FREEING_STATUSES, type ListingPackage } from "@clever/contracts/listing-package";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  IListingPackageRepository,
  ListingPackagePatch,
  NewListingPackage,
} from "./IListingPackageRepository.js";
import { toDate, toListingPackage } from "./listing-package.mapper.js";

export class PrismaListingPackageRepositoryImpl implements IListingPackageRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create(pkg: NewListingPackage): Promise<ListingPackage> {
    return toListingPackage(
      await this.db.listingPackage.create({
        data: {
          ...pkg,
          closingWindowStart: toDate(pkg.closingWindowStart),
          closingWindowEnd: toDate(pkg.closingWindowEnd),
        },
      }),
    );
  }

  async findForAgent(agentId: string, id: string): Promise<ListingPackage | null> {
    const row = await this.db.listingPackage.findFirst({ where: { id, agentId } });
    return row ? toListingPackage(row) : null;
  }

  async findById(id: string): Promise<ListingPackage | null> {
    const row = await this.db.listingPackage.findUnique({ where: { id } });
    return row ? toListingPackage(row) : null;
  }

  async listByAgent(agentId: string): Promise<ListingPackage[]> {
    const rows = await this.db.listingPackage.findMany({
      where: { agentId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toListingPackage);
  }

  async listOpenForOffers(now: Date): Promise<ListingPackage[]> {
    const rows = await this.db.listingPackage.findMany({
      where: { status: "ACCEPTING_OFFERS", offerDeadline: { gt: now } },
      orderBy: { publishedAt: "asc" },
    });
    return rows.map(toListingPackage);
  }

  async findByAddressHash(addressHash: string) {
    return this.db.listingPackage.findFirst({
      // Active means not closed or withdrawn, as the unique index on the address says (T369).
      where: { addressHash, status: { notIn: [...ADDRESS_FREEING_STATUSES] } },
      select: { id: true, agentId: true },
    });
  }

  async update(id: string, version: number, patch: ListingPackagePatch): Promise<ListingPackage> {
    const data: Prisma.ListingPackageUpdateManyMutationInput = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    if (patch.closingWindowStart !== undefined)
      data.closingWindowStart = toDate(patch.closingWindowStart);
    if (patch.closingWindowEnd !== undefined)
      data.closingWindowEnd = toDate(patch.closingWindowEnd);
    const { count } = await this.db.listingPackage.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError("This package changed since you opened it. Reload and try again.");
    }
    return toListingPackage(await this.db.listingPackage.findUniqueOrThrow({ where: { id } }));
  }

  async lock(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM "ListingPackage" WHERE id = ${id} FOR UPDATE`;
  }
}
