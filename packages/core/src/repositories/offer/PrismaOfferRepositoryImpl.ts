// The offer port over Prisma (T296): the only file with Offer and OfferRevision queries. A second
// ACTIVE offer hits the partial unique index, which becomes the same BusinessRuleError the service
// raises, so two racing submits still leave one offer.
import { BusinessRuleError, ConflictError } from "@clever/contracts/common";
import type { Offer, OfferStatus, OfferTerms, RevisionAuthor } from "@clever/contracts/offer";
import { Prisma } from "../../generated/prisma/client.js";
import {
  LIVE_OFFER_STATUSES,
  OPEN_OFFER_STATUSES,
  type IOfferRepository,
  type NewOffer,
  type RevisionOptions,
} from "./IOfferRepository.js";
import { fromRevisionTerms, toOffer, toOfferColumns, toRevisionTerms } from "./offer.mapper.js";

export class PrismaOfferRepositoryImpl implements IOfferRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create({ packageId, investorId, round, ...terms }: NewOffer): Promise<Offer> {
    try {
      const row = await this.db.offer.create({
        data: { packageId, investorId, round, ...toOfferColumns(terms) },
      });
      await this.db.offerRevision.create({
        data: { offerId: row.id, revision: 1, terms: toRevisionTerms(terms) },
      });
      return toOffer(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BusinessRuleError(
          "You already have an offer on this package; revise it instead",
          "OFFER_EXISTS",
        );
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Offer | null> {
    const row = await this.db.offer.findUnique({ where: { id } });
    return row ? toOffer(row) : null;
  }

  async findLatest(packageId: string, investorId: string, round: number): Promise<Offer | null> {
    const where = { packageId, investorId, round };
    const row =
      (await this.db.offer.findFirst({
        where: { ...where, status: { in: LIVE_OFFER_STATUSES } },
      })) ?? (await this.db.offer.findFirst({ where, orderBy: { createdAt: "desc" } }));
    return row ? toOffer(row) : null;
  }

  async findLatestForInvestor(
    investorId: string,
    packages: { id: string; round: number }[],
  ): Promise<Map<string, Offer>> {
    if (packages.length === 0) return new Map();
    const rows = await this.db.offer.findMany({
      where: { investorId, OR: packages.map(({ id, round }) => ({ packageId: id, round })) },
      orderBy: { createdAt: "desc" },
    });
    // Newest first, so a package's first row is its newest; a live offer replaces it, as in findLatest.
    const latest = new Map<string, Offer>();
    for (const row of rows) {
      const held = latest.get(row.packageId);
      const live = LIVE_OFFER_STATUSES.includes(row.status);
      if (!held || (live && !LIVE_OFFER_STATUSES.includes(held.status)))
        latest.set(row.packageId, toOffer(row));
    }
    return latest;
  }

  async listByPackage(packageId: string, round: number): Promise<Offer[]> {
    const rows = await this.db.offer.findMany({
      where: { packageId, round },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toOffer);
  }

  async revise(
    id: string,
    version: number,
    terms: OfferTerms,
    { author = "INVESTOR", status }: RevisionOptions = {},
  ): Promise<Offer> {
    const { count } = await this.db.offer.updateMany({
      where: { id, version },
      data: {
        ...toOfferColumns(terms),
        ...(status && { status }),
        currentRevision: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError("This offer changed since you opened it. Reload and try again.");
    }
    const row = await this.db.offer.findUniqueOrThrow({ where: { id } });
    await this.db.offerRevision.create({
      data: { offerId: id, revision: row.currentRevision, author, terms: toRevisionTerms(terms) },
    });
    return toOffer(row);
  }

  async findLastTerms(offerId: string, author: RevisionAuthor): Promise<OfferTerms | null> {
    const row = await this.db.offerRevision.findFirst({
      where: { offerId, author },
      orderBy: { revision: "desc" },
    });
    return row ? fromRevisionTerms(row.terms) : null;
  }

  async updateStatus(id: string, version: number, status: OfferStatus): Promise<Offer> {
    const { count } = await this.db.offer.updateMany({
      where: { id, version },
      data: { status, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError("This offer changed since you opened it. Reload and try again.");
    }
    return toOffer(await this.db.offer.findUniqueOrThrow({ where: { id } }));
  }

  async declineOpen(packageId: string, round: number): Promise<Offer[]> {
    const where = { packageId, round, status: { in: OPEN_OFFER_STATUSES } };
    const open = await this.db.offer.findMany({ where });
    await this.db.offer.updateMany({
      where: { id: { in: open.map((o) => o.id) } },
      data: { status: "DECLINED", version: { increment: 1 } },
    });
    return open.map((row) => ({ ...toOffer(row), status: "DECLINED", version: row.version + 1 }));
  }
}
