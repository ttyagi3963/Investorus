// The match port over Prisma (T288): the only file with Match queries. The Match row has no
// columns the domain type lacks, so it is returned as is. An upsert is one INSERT ... ON CONFLICT
// that adds the boxes to whatever is stored, so two matching jobs at once both keep theirs (T383).
import { randomUUID } from "node:crypto";
import type { Match } from "@clever/contracts/match";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IMatchRepository, MatchUpsert } from "./IMatchRepository.js";

export class PrismaMatchRepositoryImpl implements IMatchRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async upsert(m: MatchUpsert): Promise<{ match: Match; created: boolean }> {
    const id = randomUUID();
    // A conflicting insert waits for the other change, then adds only the boxes not stored yet.
    const [row] = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
      VALUES (${id}, ${m.packageId}, ${m.investorId}, ${m.round}, ${m.matchedBuyBoxIds}::text[],
              ${m.trigger}::"MatchTrigger")
      ON CONFLICT ("packageId", "investorId", round) DO UPDATE
      SET "matchedBuyBoxIds" = "Match"."matchedBuyBoxIds" || ARRAY(
        SELECT box FROM unnest(EXCLUDED."matchedBuyBoxIds") WITH ORDINALITY AS added(box, n)
        WHERE box <> ALL("Match"."matchedBuyBoxIds") ORDER BY n)
      RETURNING id`;
    const match = await this.db.match.findUniqueOrThrow({ where: { id: row!.id } });
    return { match, created: row!.id === id };
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

  async claimUndigested(at: Date): Promise<Match[]> {
    // UPDATE ... RETURNING: a run that meets rows another run is claiming waits, then skips them.
    const claimed = await this.db.match.updateManyAndReturn({
      where: { trigger: "BUY_BOX_CHANGE", digestedAt: null },
      data: { digestedAt: at },
    });
    return claimed.sort((a, b) => a.firstMatchedAt.getTime() - b.firstMatchedAt.getTime());
  }
}
