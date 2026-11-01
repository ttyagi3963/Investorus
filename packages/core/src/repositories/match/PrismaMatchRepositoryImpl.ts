// The match port over Prisma (T288): the only file with Match queries. The Match row has no
// columns the domain type lacks, so it is returned as is.
import type { Match } from "@clever/contracts/match";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IMatchRepository, MatchUpsert } from "./IMatchRepository.js";

export class PrismaMatchRepositoryImpl implements IMatchRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async upsert(m: MatchUpsert): Promise<{ match: Match; created: boolean }> {
    const where = {
      packageId_investorId_round: {
        packageId: m.packageId,
        investorId: m.investorId,
        round: m.round,
      },
    };
    const existing = await this.db.match.findUnique({ where });
    if (!existing) return { match: await this.db.match.create({ data: m }), created: true };
    const boxes = [...new Set([...existing.matchedBuyBoxIds, ...m.matchedBuyBoxIds])];
    if (boxes.length === existing.matchedBuyBoxIds.length)
      return { match: existing, created: false };
    const match = await this.db.match.update({ where, data: { matchedBuyBoxIds: boxes } });
    return { match, created: false };
  }

  async markNotified(id: string, listingVersion: number): Promise<void> {
    await this.db.match.update({
      where: { id },
      data: { lastNotifiedListingVersion: listingVersion },
    });
  }

  async findOne(packageId: string, investorId: string, round: number): Promise<Match | null> {
    return this.db.match.findUnique({
      where: { packageId_investorId_round: { packageId, investorId, round } },
    });
  }

  async listForInvestor(investorId: string): Promise<Match[]> {
    return this.db.match.findMany({ where: { investorId }, orderBy: { firstMatchedAt: "desc" } });
  }

  countByPackage(packageId: string, round: number): Promise<number> {
    return this.db.match.count({ where: { packageId, round } });
  }

  async listByPackage(packageId: string, round: number): Promise<Match[]> {
    return this.db.match.findMany({
      where: { packageId, round },
      orderBy: { firstMatchedAt: "asc" },
    });
  }

  async listUndigested(): Promise<Match[]> {
    return this.db.match.findMany({
      where: { trigger: "BUY_BOX_CHANGE", digestedAt: null },
      orderBy: { firstMatchedAt: "asc" },
    });
  }

  async markDigested(ids: string[], at: Date): Promise<void> {
    await this.db.match.updateMany({
      where: { id: { in: ids }, digestedAt: null },
      data: { digestedAt: at },
    });
  }
}
