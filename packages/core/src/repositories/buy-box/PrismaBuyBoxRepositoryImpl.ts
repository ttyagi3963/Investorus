// The buy box port over Prisma (T288, T321): the only file with BuyBox queries. A save writes the
// box's columns and replaces its geography rows in the caller's transaction; a name the investor
// already uses comes back from the unique index as a field error. A list criterion left blank
// ("any") is stored as NULL: Prisma cannot write NULL to a list, so one statement clears it.
import type { BuyBox, BuyBoxInput } from "@clever/contracts/buy-box";
import { ConflictError, ValidationError } from "@clever/contracts/common";
import { Prisma } from "../../generated/prisma/client.js";
import { toBuyBox } from "./buy-box.mapper.js";
import type { IBuyBoxRepository } from "./IBuyBoxRepository.js";

const NAME_TAKEN = new ValidationError("Some fields are invalid", [
  { field: "name", message: "You already have a buy box with this name" },
]);

/** The columns of a box, a blank list left out; the geography is its own rows. */
function columns({ geography: _places, ...box }: BuyBoxInput) {
  return {
    ...box,
    propertyTypes: box.propertyTypes ?? undefined,
    conditionsAccepted: box.conditionsAccepted ?? undefined,
    programsAccepted: box.programsAccepted ?? undefined,
  };
}

function geographyRows({ geographyMode, geography }: BuyBoxInput) {
  if (geographyMode === "NATIONWIDE") return [];
  const kind = geographyMode === "STATES" ? ("STATE" as const) : ("ZIP" as const);
  return [...new Set(geography)].map((value) => ({ kind, value }));
}

async function nameTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw NAME_TAKEN;
    }
    throw err;
  }
}

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

  async countMatchable(now: Date): Promise<number> {
    return this.db.buyBox.count({
      where: {
        status: "ACTIVE",
        investor: { status: "ACTIVE", proofOfFundsExpiresAt: { gt: now } },
      },
    });
  }

  async listForInvestor(investorId: string): Promise<BuyBox[]> {
    const rows = await this.db.buyBox.findMany({
      where: { investorId },
      include: { geography: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return rows.map(toBuyBox);
  }

  async findById(id: string): Promise<BuyBox | null> {
    const row = await this.db.buyBox.findUnique({ where: { id }, include: { geography: true } });
    return row ? toBuyBox(row) : null;
  }

  async findDefault(investorId: string): Promise<BuyBox | null> {
    const row = await this.db.buyBox.findFirst({
      where: { investorId, isDefault: true },
      include: { geography: true },
    });
    return row ? toBuyBox(row) : null;
  }

  async findMatchable(id: string, version: number, now: Date): Promise<BuyBox | null> {
    const row = await this.db.buyBox.findFirst({
      where: {
        id,
        version,
        status: "ACTIVE",
        investor: { status: "ACTIVE", proofOfFundsExpiresAt: { gt: now } },
      },
      include: { geography: true },
    });
    return row ? toBuyBox(row) : null;
  }

  async create(investorId: string, box: BuyBoxInput, isDefault = false): Promise<BuyBox> {
    const row = await nameTaken(
      this.db.buyBox.create({
        data: {
          ...columns(box),
          investorId,
          isDefault,
          geography: { create: geographyRows(box) },
        },
        include: { geography: true },
      }),
    );
    return toBuyBox(row);
  }

  async update(id: string, version: number, box: BuyBoxInput): Promise<BuyBox> {
    const { count } = await nameTaken(
      this.db.buyBox.updateMany({
        where: { id, version },
        data: { ...columns(box), version: { increment: 1 } },
      }),
    );
    if (count === 0) {
      throw new ConflictError("This buy box changed since you opened it. Reload and try again.");
    }
    await this.db.$executeRaw`
      UPDATE "BuyBox" SET
        "propertyTypes" = CASE WHEN ${box.propertyTypes === null} THEN NULL ELSE "propertyTypes" END,
        "conditionsAccepted" = CASE WHEN ${box.conditionsAccepted === null} THEN NULL ELSE "conditionsAccepted" END,
        "programsAccepted" = CASE WHEN ${box.programsAccepted === null} THEN NULL ELSE "programsAccepted" END
      WHERE id = ${id}`;
    await this.db.buyBoxGeography.deleteMany({ where: { buyBoxId: id } });
    await this.db.buyBoxGeography.createMany({
      data: geographyRows(box).map((row) => ({ ...row, buyBoxId: id })),
    });
    return toBuyBox(
      await this.db.buyBox.findUniqueOrThrow({ where: { id }, include: { geography: true } }),
    );
  }

  async appendVersion(box: BuyBox, createdBy: string | null): Promise<void> {
    const { id: _id, investorId: _investor, version, ...snapshot } = box;
    await this.db.buyBoxVersion.create({
      data: { buyBoxId: box.id, version, snapshot, createdBy },
    });
  }
}
