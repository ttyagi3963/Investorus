// The operations read model over Prisma (T341): the console's joins and counts as a few SQL
// statements instead of one query per row. The street line is decrypted here, as in the property
// repository; nothing else read here is PII.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type {
  DeliveryFilter,
  IOpsQueryRepository,
  OpsDelivery,
  OpsPackage,
  OpsPackageSummary,
} from "./IOpsQueryRepository.js";

type PackageRow = Omit<OpsPackageSummary, "deliveries"> & {
  pending: number;
  retrying: number;
  needsAttention: number;
};

type DeliveryRow = Omit<OpsDelivery, "packageId" | "investorId" | "noticeType"> & {
  aggregateType: string;
  aggregateId: string;
  payload: { investorId?: string; noticeType?: string };
};

const DELIVERY_COLUMNS = `
  d.id, d.target, d.status, d.attempts, d."lastError", d."nextAttemptAt", d."createdAt", d."sentAt",
  e.type AS "eventType", e."aggregateType", e."aggregateId", e.payload`;

export class PrismaOpsQueryRepositoryImpl implements IOpsQueryRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly cipher: IPiiCipher,
  ) {}

  async listPackages(): Promise<OpsPackageSummary[]> {
    const rows = await this.db.$queryRaw<PackageRow[]>`
      SELECT p.id, p.status, p.round, p."listingVersion", p."offerDeadline", p."updatedAt",
             pr."streetLine", pr.city, pr.state, pr.zip,
             (SELECT count(*)::int FROM "Match" m
               WHERE m."packageId" = p.id AND m.round = p.round) AS "matchedCount",
             (SELECT count(*)::int FROM "Offer" o
               WHERE o."packageId" = p.id AND o.round = p.round AND o.status <> 'WITHDRAWN') AS "offerCount",
             count(d.id) FILTER (WHERE d.status IN ('PENDING', 'SENDING'))::int AS pending,
             count(d.id) FILTER (WHERE d.status = 'RETRYING')::int AS retrying,
             count(d.id) FILTER (WHERE d.status = 'NEEDS_ATTENTION')::int AS "needsAttention"
      FROM "ListingPackage" p
      JOIN "Property" pr ON pr.id = p."propertyId"
      LEFT JOIN "OutboxEvent" e ON e."aggregateType" = 'ListingPackage' AND e."aggregateId" = p.id
      LEFT JOIN "Delivery" d ON d."outboxEventId" = e.id
      GROUP BY p.id, pr.id
      ORDER BY p."updatedAt" DESC`;
    return rows.map(({ pending, retrying, needsAttention, ...row }) => ({
      ...row,
      streetLine: this.cipher.decrypt(row.streetLine),
      deliveries: { pending, retrying, needsAttention },
    }));
  }

  async findPackage(id: string): Promise<OpsPackage | null> {
    const row = await this.db.listingPackage.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!row) return null;
    const { property } = row;
    return {
      id: row.id,
      status: row.status,
      round: row.round,
      listingVersion: row.listingVersion,
      offerDeadline: row.offerDeadline,
      updatedAt: row.updatedAt,
      streetLine: this.cipher.decrypt(property.streetLine),
      city: property.city,
      state: property.state,
      zip: property.zip,
    };
  }

  async deliveriesForPackage(packageId: string): Promise<OpsDelivery[]> {
    const rows = await this.db.$queryRawUnsafe<DeliveryRow[]>(
      `SELECT ${DELIVERY_COLUMNS}
       FROM "Delivery" d JOIN "OutboxEvent" e ON e.id = d."outboxEventId"
       WHERE e."aggregateType" = 'ListingPackage' AND e."aggregateId" = $1
       ORDER BY d."createdAt"`,
      packageId,
    );
    return rows.map(toOpsDelivery);
  }

  async unsentCrmDeliveries(packageIds: string[]) {
    const rows = await this.db.$queryRaw<
      (Pick<OpsDelivery, "id" | "status"> & { packageId: string })[]
    >`
      SELECT DISTINCT ON (e."aggregateId") e."aggregateId" AS "packageId", d.id, d.status
      FROM "Delivery" d JOIN "OutboxEvent" e ON e.id = d."outboxEventId"
      WHERE e."aggregateType" = 'ListingPackage' AND e."aggregateId" = ANY(${packageIds})
        AND d.target = 'CRM' AND d.status <> 'SENT'
      ORDER BY e."aggregateId", d."createdAt" DESC`;
    return new Map(rows.map(({ packageId, ...delivery }) => [packageId, delivery]));
  }

  async listDeliveries(
    { status, target, packageId }: DeliveryFilter,
    limit: number,
  ): Promise<OpsDelivery[]> {
    const rows = await this.db.$queryRawUnsafe<DeliveryRow[]>(
      `SELECT ${DELIVERY_COLUMNS}
       FROM "Delivery" d JOIN "OutboxEvent" e ON e.id = d."outboxEventId"
       WHERE ($1::text IS NULL OR d.status = $1::"DeliveryStatus")
         AND ($2::text IS NULL OR d.target = $2::"DeliveryTarget")
         AND ($3::text IS NULL OR (e."aggregateType" = 'ListingPackage' AND e."aggregateId" = $3))
       ORDER BY d."createdAt" DESC
       LIMIT $4`,
      status ?? null,
      target ?? null,
      packageId ?? null,
      limit,
    );
    return rows.map(toOpsDelivery);
  }

  async activeInvestors(): Promise<{ id: string; companyName: string }[]> {
    return this.db.investor.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
    });
  }

  async buyBoxNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.db.buyBox.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async buyBoxVersionAt(buyBoxId: string, at: Date) {
    const row = await this.db.buyBoxVersion.findFirst({
      where: { buyBoxId, createdAt: { lte: at } },
      orderBy: { version: "desc" },
    });
    return row ? { version: row.version, box: row.snapshot as unknown as BuyBox } : null;
  }

  async listingVersionCreatedAt(packageId: string, listingVersion: number): Promise<Date | null> {
    const row = await this.db.listingVersion.findUnique({
      where: { packageId_listingVersion: { packageId, listingVersion } },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }
}

function toOpsDelivery({ aggregateType, aggregateId, payload, ...row }: DeliveryRow): OpsDelivery {
  return {
    ...row,
    packageId: aggregateType === "ListingPackage" ? aggregateId : null,
    investorId: row.target === "CRM" ? null : (payload.investorId ?? null),
    noticeType: payload.noticeType ?? null,
  };
}
