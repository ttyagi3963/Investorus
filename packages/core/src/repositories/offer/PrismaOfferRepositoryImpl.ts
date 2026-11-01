// The offer port over Prisma (T291's part): the only file with Offer queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IOfferRepository } from "./IOfferRepository.js";

export class PrismaOfferRepositoryImpl implements IOfferRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async declineOpen(packageId: string, round: number): Promise<number> {
    const { count } = await this.db.offer.updateMany({
      where: { packageId, round, status: "ACTIVE" },
      data: { status: "DECLINED" },
    });
    return count;
  }
}
