// The delivery port over Prisma (T339): the only file with Delivery queries. Status changes are
// guarded by the status they start from, and an attempt's outcome also by its attempt number
// (T379), so a late, duplicate, or superseded run cannot undo a newer state.
// lastError is scrubbed of emails and phone numbers and cut to 500 characters, whoever passes it.
import type { DeliveryPlan } from "@clever/contracts/events";
import { scrubPiiText } from "../../errors/redact-pii.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type {
  DeliveryWithEvent,
  IDeliveryRepository,
  RetryAllFilter,
} from "./IDeliveryRepository.js";

const redacted = (error: string) => scrubPiiText(error).slice(0, 500);

export class PrismaDeliveryRepositoryImpl implements IDeliveryRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async createForEvent(outboxEventId: string, plans: DeliveryPlan[]): Promise<void> {
    await this.db.delivery.createMany({
      data: plans.map((plan) => ({ outboxEventId, ...plan })),
      skipDuplicates: true,
    });
  }

  async requeueStale(before: Date): Promise<number> {
    return this.db.$executeRaw`
      UPDATE "Delivery"
      SET status = 'PENDING', "queuedAt" = NULL, "nextAttemptAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE (status = 'PENDING' AND "queuedAt" < ${before})
         OR (status = 'RETRYING' AND "nextAttemptAt" < ${before})
         OR (status = 'SENDING' AND "updatedAt" < ${before})`;
  }

  async claimUnqueued(limit: number, at: Date): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Delivery"
      WHERE status = 'PENDING' AND "queuedAt" IS NULL
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}`;
    const ids = rows.map((row) => row.id);
    // The rows stay locked by this transaction until it commits, so no other relay can mark them.
    if (ids.length > 0) {
      await this.db.delivery.updateMany({ where: { id: { in: ids } }, data: { queuedAt: at } });
    }
    return ids;
  }

  async releaseQueued(ids: string[], at: Date): Promise<void> {
    await this.db.delivery.updateMany({
      where: { id: { in: ids }, status: "PENDING", queuedAt: at },
      data: { queuedAt: null },
    });
  }

  async findWithEvent(id: string): Promise<DeliveryWithEvent | null> {
    return this.db.delivery
      .findUnique({
        where: { id },
        include: {
          outboxEvent: { select: { type: true, payload: true, occurredAt: true, sequence: true } },
        },
      })
      .then((row) =>
        // A bigint column; event numbers stay far below 2^53, so a number carries them exactly.
        row
          ? { ...row, event: { ...row.outboxEvent, sequence: Number(row.outboxEvent.sequence) } }
          : null,
      );
  }

  async markSending(id: string): Promise<number | null> {
    const [started] = await this.db.delivery.updateManyAndReturn({
      where: { id, status: { in: ["PENDING", "RETRYING"] } },
      data: { status: "SENDING", attempts: { increment: 1 }, nextAttemptAt: null },
      select: { attempts: true },
    });
    return started?.attempts ?? null;
  }

  async markSent(id: string, attempt: number, at: Date): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: "SENDING", attempts: attempt },
      data: { status: "SENT", sentAt: at, lastError: null },
    });
    return count === 1;
  }

  async markRetrying(
    id: string,
    attempt: number,
    error: string,
    nextAttemptAt: Date,
  ): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: "SENDING", attempts: attempt },
      data: { status: "RETRYING", lastError: redacted(error), nextAttemptAt },
    });
    return count === 1;
  }

  async resetForRetry(id: string): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: "NEEDS_ATTENTION" },
      data: { status: "PENDING", attempts: 0, queuedAt: null, nextAttemptAt: null },
    });
    return count === 1;
  }

  async resetAllForRetry({ target, packageId }: RetryAllFilter): Promise<number> {
    // The console's delivery list selects the same way: a package's deliveries are its events'.
    const t = target ?? null;
    const p = packageId ?? null;
    return this.db.$executeRaw`
      UPDATE "Delivery" d
      SET status = 'PENDING', attempts = 0, "queuedAt" = NULL, "nextAttemptAt" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM "OutboxEvent" e
      WHERE e.id = d."outboxEventId" AND d.status = 'NEEDS_ATTENTION'
        AND (${t}::text IS NULL OR d.target = ${t}::"DeliveryTarget")
        AND (${p}::text IS NULL OR (e."aggregateType" = 'ListingPackage' AND e."aggregateId" = ${p}))`;
  }

  async markNeedsAttention(id: string, attempt: number, error: string): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: "SENDING", attempts: attempt },
      data: { status: "NEEDS_ATTENTION", lastError: redacted(error), nextAttemptAt: null },
    });
    return count === 1;
  }

  async giveUp(id: string, error: string): Promise<void> {
    await this.db.delivery.updateMany({
      where: { id, status: { in: ["PENDING", "SENDING", "RETRYING"] } },
      data: { status: "NEEDS_ATTENTION", lastError: redacted(error), nextAttemptAt: null },
    });
  }
}
