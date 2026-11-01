// The outbox port over Prisma (T337): the only file with OutboxEvent queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IOutboxRepository, NewOutboxEvent, UnrelayedEvent } from "./IOutboxRepository.js";

export class PrismaOutboxRepositoryImpl implements IOutboxRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async append(event: NewOutboxEvent): Promise<void> {
    await this.db.outboxEvent.create({
      data: { ...event, payload: event.payload as Prisma.InputJsonValue },
    });
  }

  async claimUnrelayed(limit: number): Promise<UnrelayedEvent[]> {
    return this.db.$queryRaw<UnrelayedEvent[]>`
      SELECT id, type, payload FROM "OutboxEvent"
      WHERE "relayedAt" IS NULL
      ORDER BY "occurredAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}`;
  }

  async markRelayed(ids: string[], at: Date): Promise<void> {
    await this.db.outboxEvent.updateMany({
      where: { id: { in: ids }, relayedAt: null },
      data: { relayedAt: at },
    });
  }
}
