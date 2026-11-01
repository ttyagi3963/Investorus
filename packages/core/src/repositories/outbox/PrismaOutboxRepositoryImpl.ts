// The outbox port over Prisma (T337): the only file with OutboxEvent queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IOutboxRepository, NewOutboxEvent } from "./IOutboxRepository.js";

export class PrismaOutboxRepositoryImpl implements IOutboxRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async append(event: NewOutboxEvent): Promise<void> {
    await this.db.outboxEvent.create({
      data: { ...event, payload: event.payload as Prisma.InputJsonValue },
    });
  }
}
