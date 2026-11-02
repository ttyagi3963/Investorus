// The idempotency key store over Postgres (T285, T367): the only file with IdempotencyKey queries.
// A claim is one INSERT ... ON CONFLICT, so two requests with the same key can never both hold it.
// A claim is a lease with its own token. The request's first write marks the claim committed in
// that write's own transaction (markClaimCommitted, called by the unit of work), and only while
// the claim still holds its lease. So after a crash a retry knows the truth:
// - lease still running: the request may still be running (in progress);
// - lease over, nothing committed: safe to run again (the key is taken over);
// - lease over, committed but no answer stored: it already ran ("applied", never re-run).
// A key older than 24 hours is claimed afresh. The stored answer can hold seller details, so it is
// encrypted with the PII cipher (constitution XII).
import { randomUUID } from "node:crypto";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { currentIdempotencyClaim } from "../../infra/idempotency-context.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type {
  IIdempotencyStore,
  IdempotencyClaim,
  IdempotencyRequest,
} from "./IIdempotencyStore.js";

/** Longer than any request takes; a request still running past it cannot commit. */
const LEASE_MS = 30_000;

const unavailable = (cause: unknown) =>
  new InfrastructureError("The idempotency key store did not answer", 503, cause);

type KeyRow = {
  method: string;
  path: string;
  bodyHash: string;
  status: "IN_PROGRESS" | "DONE";
  responseStatus: number | null;
  responseBody: string | null;
  committed: boolean;
  leaseOver: boolean;
};

export class PrismaIdempotencyStoreImpl implements IIdempotencyStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: IPiiCipher,
    private readonly leaseMs = LEASE_MS,
  ) {}

  async claim(r: IdempotencyRequest): Promise<IdempotencyClaim> {
    const token = randomUUID();
    try {
      // Taken over when the key is past retention, or when the same request's claim ran out of
      // lease without committing anything (its process died before writing).
      const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "IdempotencyKey"
          (id, "userId", key, method, path, "bodyHash", "claimToken", "lockedUntil")
        VALUES (${randomUUID()}, ${r.userId}, ${r.key}, ${r.method}, ${r.path}, ${r.bodyHash},
          ${token}, clock_timestamp() + ${this.leaseMs}::int * INTERVAL '1 millisecond')
        ON CONFLICT ("userId", key) DO UPDATE SET
          method = EXCLUDED.method, path = EXCLUDED.path, "bodyHash" = EXCLUDED."bodyHash",
          status = 'IN_PROGRESS', "responseStatus" = NULL, "responseBody" = NULL,
          "claimToken" = EXCLUDED."claimToken", "lockedUntil" = EXCLUDED."lockedUntil",
          "committedAt" = NULL, "createdAt" = CURRENT_TIMESTAMP
        WHERE "IdempotencyKey"."createdAt" < CURRENT_TIMESTAMP - INTERVAL '24 hours'
          OR ("IdempotencyKey".status = 'IN_PROGRESS'
            AND "IdempotencyKey"."committedAt" IS NULL
            AND "IdempotencyKey"."lockedUntil" < clock_timestamp()
            AND "IdempotencyKey".method = EXCLUDED.method
            AND "IdempotencyKey".path = EXCLUDED.path
            AND "IdempotencyKey"."bodyHash" = EXCLUDED."bodyHash")
        RETURNING id`;
      if (claimed.length > 0) return { kind: "claimed", token };

      const [row] = await this.prisma.$queryRaw<KeyRow[]>`
        SELECT method, path, "bodyHash", status::text AS status, "responseStatus", "responseBody",
          "committedAt" IS NOT NULL AS committed, "lockedUntil" < clock_timestamp() AS "leaseOver"
        FROM "IdempotencyKey" WHERE "userId" = ${r.userId} AND key = ${r.key}`;
      // No row: the first request just failed with a 5xx and freed the key; retrying is safe.
      if (!row) return { kind: "in-progress" };
      if (row.method !== r.method || row.path !== r.path || row.bodyHash !== r.bodyHash) {
        return { kind: "mismatch" };
      }
      if (row.status === "IN_PROGRESS" || row.responseStatus === null) {
        return row.committed && row.leaseOver ? { kind: "applied" } : { kind: "in-progress" };
      }
      const body = row.responseBody === null ? null : this.cipher.decrypt(row.responseBody);
      return { kind: "replay", status: row.responseStatus, body };
    } catch (cause) {
      throw unavailable(cause);
    }
  }

  async complete(
    userId: string,
    key: string,
    token: string,
    status: number,
    body: string | null,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyKey.updateMany({
        where: { userId, key, claimToken: token, status: "IN_PROGRESS" },
        data: {
          status: "DONE",
          responseStatus: status,
          responseBody: body === null ? null : this.cipher.encrypt(body),
        },
      });
    } catch (cause) {
      throw unavailable(cause);
    }
  }

  async release(userId: string, key: string, token: string): Promise<void> {
    try {
      // Nothing committed: free the key, so a retry runs the change.
      await this.prisma.idempotencyKey.deleteMany({
        where: { userId, key, claimToken: token, status: "IN_PROGRESS", committedAt: null },
      });
      // A write committed before the 5xx: end the lease now, so a retry is told it already ran.
      await this.prisma.idempotencyKey.updateMany({
        where: {
          userId,
          key,
          claimToken: token,
          status: "IN_PROGRESS",
          committedAt: { not: null },
        },
        data: { lockedUntil: new Date() },
      });
    } catch (cause) {
      throw unavailable(cause);
    }
  }
}

/**
 * Called by the unit of work at the end of every transaction. If the transaction wrote anything
 * and the request holds an idempotency claim, marks the claim committed in this same transaction,
 * so the two commit or roll back together. A claim that lost its lease (the request ran too long,
 * and a retry may have taken the key over) cannot be marked, and the transaction is rolled back
 * rather than letting the change run twice.
 */
export async function markClaimCommitted(tx: Prisma.TransactionClient): Promise<void> {
  const claim = currentIdempotencyClaim();
  if (!claim) return;
  // Postgres assigns a transaction ID on the first write: none means a read-only transaction.
  const [row] = await tx.$queryRaw<{ wrote: boolean }[]>`
    SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS wrote`;
  if (!row?.wrote) return;
  const marked = await tx.$executeRaw`
    UPDATE "IdempotencyKey" SET "committedAt" = COALESCE("committedAt", clock_timestamp())
    WHERE "userId" = ${claim.userId} AND key = ${claim.key} AND "claimToken" = ${claim.token}
      AND status = 'IN_PROGRESS' AND "lockedUntil" > clock_timestamp()`;
  if (marked === 0) {
    throw new InfrastructureError("This request took too long and was not applied; retry it", 503);
  }
}
