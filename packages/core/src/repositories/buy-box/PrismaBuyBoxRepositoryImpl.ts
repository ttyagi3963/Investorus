// The buy box port over Prisma (T288): the only file with BuyBox queries.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { Prisma } from "../../generated/prisma/client.js";
import { toBuyBox } from "./buy-box.mapper.js";
import type { IBuyBoxRepository } from "./IBuyBoxRepository.js";

export class PrismaBuyBoxRepositoryImpl implements IBuyBoxRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async listCandidates(zip: string, state: string, now: Date): Promise<BuyBox[]> {
    const rows = await this.db.buyBox.findMany({
      where: {
        status: "ACTIVE",
        investor: { status: "ACTIVE", proofOfFundsExpiresAt: { gt: now } },
        OR: [
          { geographyMode: "NATIONWIDE" },
          {
            geography: {
              some: {
                OR: [
                  { kind: "ZIP", value: zip },
                  { kind: "STATE", value: state },
                ],
              },
            },
          },
        ],
      },
      include: { geography: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toBuyBox);
  }
}
