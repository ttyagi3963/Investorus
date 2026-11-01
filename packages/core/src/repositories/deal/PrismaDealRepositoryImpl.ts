// The deal port over Prisma (T309, T311): the only file with Deal queries. A second active deal
// hits the partial unique index, which becomes the same BusinessRuleError the workflow raises when
// it sees one first, so a race and a plain repeat get the same answer. The fall-through reason is
// encrypted on the way in and decrypted in the mapper.
import { BusinessRuleError, ConflictError } from "@clever/contracts/common";
import type { Deal } from "@clever/contracts/deal";
import { Prisma } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import {
  ALREADY_ACCEPTED,
  type DealPatch,
  type IDealRepository,
  type NewDeal,
} from "./IDealRepository.js";
import { toDeal } from "./deal.mapper.js";

const FINAL = ["CLOSED", "FELL_THROUGH", "RECONFIRM_DECLINED"] as const;

export class PrismaDealRepositoryImpl implements IDealRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly cipher: IPiiCipher,
  ) {}

  async create(deal: NewDeal): Promise<Deal> {
    try {
      return toDeal(await this.db.deal.create({ data: deal }), this.cipher);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BusinessRuleError(ALREADY_ACCEPTED, "PACKAGE_HAS_ACCEPTED_OFFER");
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Deal | null> {
    const row = await this.db.deal.findUnique({ where: { id } });
    return row ? toDeal(row, this.cipher) : null;
  }

  async findByOffer(offerId: string): Promise<Deal | null> {
    const row = await this.db.deal.findUnique({ where: { offerId } });
    return row ? toDeal(row, this.cipher) : null;
  }

  async findActiveByPackage(packageId: string): Promise<Deal | null> {
    const row = await this.db.deal.findFirst({
      where: { packageId, status: { notIn: [...FINAL] } },
    });
    return row ? toDeal(row, this.cipher) : null;
  }

  async findLatestByPackage(packageId: string): Promise<Deal | null> {
    const row = await this.db.deal.findFirst({
      where: { packageId },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDeal(row, this.cipher) : null;
  }

  async update(id: string, version: number, patch: DealPatch): Promise<Deal> {
    const { fellThroughReason, ...rest } = patch;
    const { count } = await this.db.deal.updateMany({
      where: { id, version },
      data: {
        ...rest,
        ...(fellThroughReason != null && {
          fellThroughReason: this.cipher.encrypt(fellThroughReason),
        }),
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError("This deal changed since you opened it. Reload and try again.");
    }
    return toDeal(await this.db.deal.findUniqueOrThrow({ where: { id } }), this.cipher);
  }
}
