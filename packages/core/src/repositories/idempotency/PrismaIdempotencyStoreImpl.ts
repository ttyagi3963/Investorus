// The idempotency key store over Postgres (T285): the only file with IdempotencyKey queries. A claim
// is one INSERT ... ON CONFLICT, so two requests with the same key can never both claim it; a key
// older than 24 hours is claimed again in the same statement.
import { randomUUID } from "node:crypto";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type {
  IIdempotencyStore,
  IdempotencyClaim,
  IdempotencyRequest,
} from "./IIdempotencyStore.js";

const unavailable = (cause: unknown) =>
  new InfrastructureError("The idempotency key store did not answer", 503, cause);

export class PrismaIdempotencyStoreImpl implements IIdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(r: IdempotencyRequest): Promise<IdempotencyClaim> {
    try {
      const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "IdempotencyKey" (id, "userId", key, method, path, "bodyHash")
        VALUES (${randomUUID()}, ${r.userId}, ${r.key}, ${r.method}, ${r.path}, ${r.bodyHash})
        ON CONFLICT ("userId", key) DO UPDATE SET
          method = EXCLUDED.method, path = EXCLUDED.path, "bodyHash" = EXCLUDED."bodyHash",
          status = 'IN_PROGRESS', "responseStatus" = NULL, "responseBody" = NULL,
          "createdAt" = CURRENT_TIMESTAMP
        WHERE "IdempotencyKey"."createdAt" < CURRENT_TIMESTAMP - INTERVAL '24 hours'
        RETURNING id`;
      if (claimed.length > 0) return { kind: "claimed" };

      const row = await this.prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: r.userId, key: r.key } },
      });
      // No row: the first request just failed with a 5xx and freed the key; retrying is safe.
      if (!row) return { kind: "in-progress" };
      if (row.method !== r.method || row.path !== r.path || row.bodyHash !== r.bodyHash) {
        return { kind: "mismatch" };
      }
      if (row.status === "IN_PROGRESS" || row.responseStatus === null) {
        return { kind: "in-progress" };
      }
      return { kind: "replay", status: row.responseStatus, body: row.responseBody };
    } catch (cause) {
      throw unavailable(cause);
    }
  }

  async complete(userId: string, key: string, status: number, body: unknown): Promise<void> {
    try {
      await this.prisma.idempotencyKey.updateMany({
        where: { userId, key, status: "IN_PROGRESS" },
        data: {
          status: "DONE",
          responseStatus: status,
          responseBody: body == null ? Prisma.DbNull : (body as Prisma.InputJsonValue),
        },
      });
    } catch (cause) {
      throw unavailable(cause);
    }
  }

  async release(userId: string, key: string): Promise<void> {
    try {
      await this.prisma.idempotencyKey.deleteMany({
        where: { userId, key, status: "IN_PROGRESS" },
      });
    } catch (cause) {
      throw unavailable(cause);
    }
  }
}
