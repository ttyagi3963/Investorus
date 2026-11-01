// The offer port over Prisma (T296): the only file with Offer and OfferRevision queries. A second
// ACTIVE offer hits the partial unique index, which becomes the same BusinessRuleError the service
// raises, so two racing submits still leave one offer.
import { BusinessRuleError, ConflictError } from "@clever/contracts/common";
import type { Offer, OfferTerms } from "@clever/contracts/offer";
import { Prisma } from "../../generated/prisma/client.js";
import type { IOfferRepository, NewOffer } from "./IOfferRepository.js";
import { toOffer, toOfferColumns, toRevisionTerms } from "./offer.mapper.js";

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
    const row = await this.db.offer.findFirst({
      where: { packageId, investorId, round },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return row ? toOffer(row) : null;
  }

  async listByPackage(packageId: string, round: number): Promise<Offer[]> {
    const rows = await this.db.offer.findMany({
      where: { packageId, round },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toOffer);
  }

  async revise(id: string, version: number, terms: OfferTerms): Promise<Offer> {
    const { count } = await this.db.offer.updateMany({
      where: { id, version },
      data: {
        ...toOfferColumns(terms),
        currentRevision: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError("This offer changed since you opened it. Reload and try again.");
    }
    const row = await this.db.offer.findUniqueOrThrow({ where: { id } });
    await this.db.offerRevision.create({
      data: { offerId: id, revision: row.currentRevision, terms: toRevisionTerms(terms) },
    });
    return toOffer(row);
  }

  async declineOpen(packageId: string, round: number): Promise<number> {
    const { count } = await this.db.offer.updateMany({
      where: { packageId, round, status: "ACTIVE" },
      data: { status: "DECLINED" },
    });
    return count;
  }
}
