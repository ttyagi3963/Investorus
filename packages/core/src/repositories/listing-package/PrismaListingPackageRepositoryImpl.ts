// The listing-package port over Prisma (T247): the only file with ListingPackage queries. A second
// active package at an address hits the partial unique index, which becomes the same
// BusinessRuleError the service raises when it sees the first, so a race gets a 409, not a 500 (T383).
import { BusinessRuleError, ConflictError } from "@clever/contracts/common";
import { ADDRESS_FREEING_STATUSES, type ListingPackage } from "@clever/contracts/listing-package";
import { Prisma } from "../../generated/prisma/client.js";
import type {
  IListingPackageRepository,
  ListingPackagePatch,
  NewListingPackage,
} from "./IListingPackageRepository.js";
import { toDate, toListingPackage } from "./listing-package.mapper.js";

/** A write the address index refuses: another active package took the address meanwhile. */
async function addressFree<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BusinessRuleError(
        "This address already has a listing package",
        "DUPLICATE_ACTIVE_LISTING",
      );
    }
    throw err;
  }
}

export class PrismaListingPackageRepositoryImpl implements IListingPackageRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create(pkg: NewListingPackage): Promise<ListingPackage> {
    return toListingPackage(
      await addressFree(
        this.db.listingPackage.create({
          data: {
            ...pkg,
            closingWindowStart: toDate(pkg.closingWindowStart),
            closingWindowEnd: toDate(pkg.closingWindowEnd),
          },
        }),
      ),
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

  async findByIds(ids: string[]): Promise<Map<string, ListingPackage>> {
    const rows = await this.db.listingPackage.findMany({ where: { id: { in: ids } } });
    return new Map(rows.map((row) => [row.id, toListingPackage(row)]));
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
    const { count } = await addressFree(
      this.db.listingPackage.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    if (count === 0) {
      throw new ConflictError("This package changed since you opened it. Reload and try again.");
    }
    return toListingPackage(await this.db.listingPackage.findUniqueOrThrow({ where: { id } }));
  }

  async lock(id: string): Promise<void> {
    await this.db.$queryRaw`SELECT id FROM "ListingPackage" WHERE id = ${id} FOR UPDATE`;
  }
}
