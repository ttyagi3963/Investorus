// The deal port over Prisma (T309): the only file with Deal queries. A second active deal hits the
// partial unique index, which becomes the same BusinessRuleError the workflow raises when it sees
// one first, so a race and a plain repeat get the same answer.
import { BusinessRuleError } from "@clever/contracts/common";
import type { Deal } from "@clever/contracts/deal";
import { Prisma } from "../../generated/prisma/client.js";
import { ALREADY_ACCEPTED, type IDealRepository, type NewDeal } from "./IDealRepository.js";

export class PrismaDealRepositoryImpl implements IDealRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async create(deal: NewDeal): Promise<Deal> {
    try {
      return await this.db.deal.create({ data: deal });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BusinessRuleError(ALREADY_ACCEPTED, "PACKAGE_HAS_ACCEPTED_OFFER");
      }
      throw err;
    }
  }

  async findActiveByPackage(packageId: string): Promise<Deal | null> {
    return this.db.deal.findFirst({
      where: { packageId, status: { notIn: ["CLOSED", "FELL_THROUGH", "RECONFIRM_DECLINED"] } },
    });
  }
}
