// The delivery port over Prisma (T339): the only file with Delivery queries. Status changes are
// guarded by the status they start from, so a late or duplicate job cannot undo a newer state.
// lastError is cut to 500 characters; callers pass messages that never carry PII.
import type { DeliveryPlan } from "@clever/contracts/events";
import type { Prisma } from "../../generated/prisma/client.js";
import type { DeliveryWithEvent, IDeliveryRepository } from "./IDeliveryRepository.js";

const redacted = (error: string) => error.slice(0, 500);

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

  async claimUnqueued(limit: number): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Delivery"
      WHERE status = 'PENDING' AND "queuedAt" IS NULL
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}`;
    return rows.map((row) => row.id);
  }

  async markQueued(ids: string[], at: Date): Promise<void> {
    await this.db.delivery.updateMany({ where: { id: { in: ids } }, data: { queuedAt: at } });
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

  async markSending(id: string): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: { in: ["PENDING", "RETRYING"] } },
      data: { status: "SENDING", attempts: { increment: 1 }, nextAttemptAt: null },
    });
    return count === 1;
  }

  async markSent(id: string, at: Date): Promise<void> {
    await this.db.delivery.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "SENT", sentAt: at, lastError: null },
    });
  }

  async markRetrying(id: string, error: string, nextAttemptAt: Date): Promise<void> {
    await this.db.delivery.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "RETRYING", lastError: redacted(error), nextAttemptAt },
    });
  }

  async resetForRetry(id: string): Promise<boolean> {
    const { count } = await this.db.delivery.updateMany({
      where: { id, status: "NEEDS_ATTENTION" },
      data: { status: "PENDING", attempts: 0, queuedAt: null, nextAttemptAt: null },
    });
    return count === 1;
  }

  async markNeedsAttention(id: string, error: string): Promise<void> {
    await this.db.delivery.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "NEEDS_ATTENTION", lastError: redacted(error), nextAttemptAt: null },
    });
  }
}
