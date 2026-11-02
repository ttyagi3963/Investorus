// The durable job port over Prisma (T288): the only file with Job queries. Enqueue, claim, and
// fail are single SQL statements, so two workers or two requests can never race: the partial
// unique index keeps one live job per dedupe key, and FOR UPDATE SKIP LOCKED hands each job to one
// worker. A job is due when the worker's clock reaches its runAt, so tests can move time; the other
// times come from the database clock, like the columns' defaults. Renew, complete, and fail match
// the worker holding the lease, so a worker that lost it changes nothing (T378).
import { randomUUID } from "node:crypto";
import type { Job } from "@clever/contracts/jobs";
import type { Prisma } from "../../generated/prisma/client.js";
import { currentTraceId } from "../../infra/trace-context.js";
import type { IJobRepository, NewJob } from "./IJobRepository.js";

/** A failed run waits 5 s, then 10 s, 20 s, ... before its next try. */
const BACKOFF_SECONDS = 5;
/** The error a reclaimed job carries. */
const LOST_RUN = "The worker stopped before the job finished";

export class PrismaJobRepositoryImpl implements IJobRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async enqueue({ type, dedupeKey, payload, runAt }: NewJob): Promise<Job> {
    const inserted = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Job" (id, type, "dedupeKey", payload, "runAt", "correlationId", "updatedAt")
      VALUES (${randomUUID()}, ${type}::"JobType", ${dedupeKey}, ${JSON.stringify(payload)}::jsonb,
              COALESCE(${runAt ?? null}::timestamp, CURRENT_TIMESTAMP), ${currentTraceId() ?? null},
              CURRENT_TIMESTAMP)
      ON CONFLICT ("type", "dedupeKey") WHERE status IN ('QUEUED', 'PROCESSING') DO NOTHING
      RETURNING id`;
    const row = inserted[0]
      ? await this.db.job.findUniqueOrThrow({ where: { id: inserted[0].id } })
      : await this.db.job.findFirstOrThrow({
          where: { type, dedupeKey, status: { in: ["QUEUED", "PROCESSING"] } },
        });
    return toJob(row);
  }

  async claimNext(workerId: string, now: Date): Promise<Job | null> {
    const claimed = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "Job"
      SET status = 'PROCESSING', "lockedAt" = CURRENT_TIMESTAMP, "lockedBy" = ${workerId},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM "Job"
        WHERE status = 'QUEUED' AND "runAt" <= ${now}
        ORDER BY "runAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id`;
    if (!claimed[0]) return null;
    return toJob(await this.db.job.findUniqueOrThrow({ where: { id: claimed[0].id } }));
  }

  async renewLease(id: string, workerId: string): Promise<boolean> {
    const renewed = await this.db.$executeRaw`
      UPDATE "Job" SET "lockedAt" = CURRENT_TIMESTAMP
      WHERE id = ${id} AND status = 'PROCESSING' AND "lockedBy" = ${workerId}`;
    return renewed === 1;
  }

  async reclaimStale(seconds: number): Promise<Job[]> {
    const reclaimed = await this.db.$queryRaw<{ id: string }[]>`
      UPDATE "Job"
      SET status = CASE WHEN "retryCount" < "maxRetries"
                        THEN 'QUEUED'::"JobStatus" ELSE 'FAILED'::"JobStatus" END,
          "retryCount" = "retryCount" + 1, error = ${LOST_RUN},
          "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE status = 'PROCESSING' AND "lockedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${seconds})
      RETURNING id`;
    if (reclaimed.length === 0) return [];
    const rows = await this.db.job.findMany({ where: { id: { in: reclaimed.map((r) => r.id) } } });
    return rows.map(toJob);
  }

  async complete(id: string, workerId: string): Promise<boolean> {
    const { count } = await this.db.job.updateMany({
      where: { id, status: "PROCESSING", lockedBy: workerId },
      data: { status: "COMPLETED", lockedAt: null, lockedBy: null, error: null },
    });
    return count === 1;
  }

  async fail(id: string, workerId: string, error: string, retry: boolean): Promise<Job | null> {
    const failed = await this.db.$executeRaw`
      UPDATE "Job"
      SET status = CASE WHEN ${retry} AND "retryCount" < "maxRetries"
                        THEN 'QUEUED'::"JobStatus" ELSE 'FAILED'::"JobStatus" END,
          "runAt" = CURRENT_TIMESTAMP + make_interval(secs => ${BACKOFF_SECONDS} * power(2, "retryCount")),
          "retryCount" = "retryCount" + 1,
          error = ${error}, "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${id} AND status = 'PROCESSING' AND "lockedBy" = ${workerId}`;
    if (failed === 0) return null;
    return toJob(await this.db.job.findUniqueOrThrow({ where: { id } }));
  }
}

function toJob(row: Prisma.JobGetPayload<object>): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    dedupeKey: row.dedupeKey,
    payload: row.payload,
    runAt: row.runAt,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    error: row.error,
    correlationId: row.correlationId,
  };
}
