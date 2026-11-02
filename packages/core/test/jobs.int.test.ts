// Checks the durable job rules against a real Postgres (T289; constitution VIII): one live job per
// dedupe key, carrying the trace ID of the request that queued it; two workers never claim the same
// job; a job scheduled for later waits for its time on the worker's clock; a failure is retried
// until maxRetries, then FAILED; a job whose worker renews its lease is never taken over, one whose
// worker died is reclaimed as a used try, then FAILED; and a worker that lost the lease changes
// nothing (T378).
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { runWithTrace } from "../src/infra/trace-context.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let uow: PrismaUnitOfWorkImpl;
let stop: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

const enqueue = (dedupeKey = `MATCH_PACKAGE:package-${++n}:1:1`) =>
  uow.run((repos) =>
    repos.jobs.enqueue({ type: "MATCH_PACKAGE", dedupeKey, payload: { packageId: "p" } }),
  );

describe("Job repository", () => {
  it("returns the live job for a repeated dedupe key, with the queuing request's trace ID", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const first = await runWithTrace(traceId, () => enqueue("MATCH_PACKAGE:dedupe:1:1"));
    const again = await enqueue("MATCH_PACKAGE:dedupe:1:1");
    expect(again.id).toBe(first.id);
    expect(first.correlationId).toBe(traceId);
  });

  it("never lets two workers claim the same job", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED'`);
    const job = await enqueue();
    const [a, b] = await Promise.all([
      uow.run((repos) => repos.jobs.claimNext("worker-a", new Date())),
      uow.run((repos) => repos.jobs.claimNext("worker-b", new Date())),
    ]);
    expect([a?.id, b?.id].filter(Boolean)).toEqual([job.id]);
  });

  it("does not claim a job scheduled for later until the worker's clock reaches it", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE status <> 'FAILED'`);
    const runAt = new Date(Date.now() + 48 * 3_600_000);
    const job = await uow.run((repos) =>
      repos.jobs.enqueue({ type: "MATCH_PACKAGE", dedupeKey: "later", payload: {}, runAt }),
    );
    expect(await uow.run((repos) => repos.jobs.claimNext("worker-a", new Date()))).toBeNull();
    expect((await uow.run((repos) => repos.jobs.claimNext("worker-a", runAt)))?.id).toBe(job.id);
  });

  it("re-queues a failed job until it has been retried maxRetries times, then marks it FAILED", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE status <> 'FAILED'`);
    // Past every backoff, so each try is due at once.
    const later = new Date(Date.now() + 3_600_000);
    const runOnce = async (id: string, retry: boolean) => {
      await uow.run((repos) => repos.jobs.claimNext("worker-a", later));
      return (await uow.run((repos) => repos.jobs.fail(id, "worker-a", "boom", retry)))!.status;
    };
    const job = await enqueue();
    const statuses: string[] = [];
    for (let run = 0; run <= job.maxRetries; run += 1) statuses.push(await runOnce(job.id, true));
    expect(statuses).toEqual(["QUEUED", "QUEUED", "QUEUED", "FAILED"]);
    expect(await runOnce((await enqueue()).id, false)).toBe("FAILED");
  });

  it("keeps a job whose worker renews its lease, however long the run takes", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE status <> 'FAILED'`);
    const job = await enqueue();
    await uow.run((repos) => repos.jobs.claimNext("worker-a", new Date()));
    await age(job.id);
    expect(await uow.run((repos) => repos.jobs.renewLease(job.id, "worker-a"))).toBe(true);
    expect(await uow.run((repos) => repos.jobs.renewLease(job.id, "worker-b"))).toBe(false);
    expect(await uow.run((repos) => repos.jobs.reclaimStale(60))).toEqual([]);
  });

  it("reclaims a job whose worker stopped renewing its lease as a used try, then FAILS it", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE status <> 'FAILED'`);
    const job = await enqueue();
    const statuses: string[] = [];
    for (let run = 0; run <= job.maxRetries; run += 1) {
      await uow.run((repos) => repos.jobs.claimNext(`worker-${run}`, new Date()));
      expect(await uow.run((repos) => repos.jobs.reclaimStale(60))).toEqual([]);
      await age(job.id);
      const [lost] = await uow.run((repos) => repos.jobs.reclaimStale(60));
      statuses.push(lost!.status);
    }
    expect(statuses).toEqual(["QUEUED", "QUEUED", "QUEUED", "FAILED"]);
  });

  it("lets a worker that lost the lease change nothing", async () => {
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE status <> 'FAILED'`);
    const job = await enqueue();
    await uow.run((repos) => repos.jobs.claimNext("worker-a", new Date()));
    await age(job.id);
    await uow.run((repos) => repos.jobs.reclaimStale(60));
    await uow.run((repos) => repos.jobs.claimNext("worker-b", new Date()));

    expect(await uow.run((repos) => repos.jobs.complete(job.id, "worker-a"))).toBe(false);
    expect(await uow.run((repos) => repos.jobs.fail(job.id, "worker-a", "late", true))).toBeNull();
    const held = await db.query(`SELECT status, "lockedBy", error FROM "Job" WHERE id = $1`, [
      job.id,
    ]);
    expect(held.rows[0]).toMatchObject({ status: "PROCESSING", lockedBy: "worker-b" });
    expect(await uow.run((repos) => repos.jobs.complete(job.id, "worker-b"))).toBe(true);
  });
});

/** Moves the job's lease back past the 60 s its worker has to renew it. */
const age = (id: string) =>
  db.query(
    `UPDATE "Job" SET "lockedAt" = CURRENT_TIMESTAMP - interval '61 seconds' WHERE id = $1`,
    [id],
  );
