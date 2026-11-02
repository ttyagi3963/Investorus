// Checks that an idempotency key survives a crashed request on a real Postgres (T367; XX.2). If the
// process dies before the change commits, a retry after the lease runs it once. If it dies after the
// commit, a retry is told it was applied and nothing runs twice; the same holds after a 5xx. A
// request that outlives its lease cannot commit once a retry has taken the key over. A crash is
// simulated by not settling the claim, and the lease running out by moving it into the past. The
// database's time zone is not UTC, as a server elsewhere may be, and every lease still holds. A key
// past its 24 hours is purged with its stored answer; a newer one stays (T390).
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWithIdempotencyClaim } from "../src/infra/idempotency-context.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaIdempotencyStoreImpl } from "../src/repositories/idempotency/PrismaIdempotencyStoreImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

const USER = "user-1";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let store: PrismaIdempotencyStoreImpl;
let uow: PrismaUnitOfWorkImpl;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase({ timeZone: "America/Chicago" }));
  prisma = createPrismaClient(url);
  const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
  store = new PrismaIdempotencyStoreImpl(prisma, cipher);
  uow = new PrismaUnitOfWorkImpl(prisma, cipher);
  await db.query(`
    INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "updatedAt")
      VALUES ('${USER}', 'ops@example.test', 'hash', 'OPS', 'Ops', now())`);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

const request = (key: string) => ({ userId: USER, key, method: "POST", path: "/x", bodyHash: "h" });

/** The request's change: one audit entry named after the key, written under the claim. */
const change = (key: string, token: string) =>
  runWithIdempotencyClaim({ userId: USER, key, token }, () =>
    uow.run((repos) =>
      repos.audit.append({
        actorType: "USER",
        actorId: USER,
        action: "SIMULATION_CHANGED",
        entityType: "Test",
        entityId: key,
        outcome: "SUCCESS",
      }),
    ),
  );

const timesApplied = async (key: string) =>
  Number(
    (await db.query(`SELECT count(*) FROM "AuditLog" WHERE "entityId" = $1`, [key])).rows[0].count,
  );

const endLease = (key: string) =>
  db.query(
    `UPDATE "IdempotencyKey" SET "lockedUntil" = now() - interval '1 second' WHERE key = $1`,
    [key],
  );

const tokenOf = async (key: string) => {
  const claim = await store.claim(request(key));
  if (claim.kind !== "claimed") throw new Error(`Expected a claim, got ${claim.kind}`);
  return claim.token;
};

describe("an idempotency key after a crashed request", () => {
  it("runs the change once when the process died before it committed", async () => {
    await tokenOf("before-commit");
    // Within the lease the first request may still be running.
    expect(await store.claim(request("before-commit"))).toEqual({ kind: "in-progress" });

    await endLease("before-commit");
    const retry = await tokenOf("before-commit");
    await change("before-commit", retry);
    await store.complete(USER, "before-commit", retry, 201, null);

    expect(await store.claim(request("before-commit"))).toMatchObject({ kind: "replay" });
    expect(await timesApplied("before-commit")).toBe(1);
  });

  it("never runs it twice when the process died after the commit, or after a 5xx", async () => {
    const first = await tokenOf("after-commit");
    await change("after-commit", first);
    await endLease("after-commit");
    expect(await store.claim(request("after-commit"))).toEqual({ kind: "applied" });

    const failed = await tokenOf("after-5xx");
    await change("after-5xx", failed);
    await store.release(USER, "after-5xx", failed);
    expect(await store.claim(request("after-5xx"))).toEqual({ kind: "applied" });

    expect([await timesApplied("after-commit"), await timesApplied("after-5xx")]).toEqual([1, 1]);
  });

  it("refuses the commit of a request that outlived its lease once a retry took over", async () => {
    const slow = await tokenOf("slow");
    await endLease("slow");
    const retry = await tokenOf("slow");

    await expect(change("slow", slow)).rejects.toMatchObject({ status: 503 });
    await change("slow", retry);
    expect(await timesApplied("slow")).toBe(1);
  });
});

describe("an idempotency key past its 24 hours", () => {
  it("is purged with its stored answer, while newer keys stay, answered or still running", async () => {
    for (const key of ["expired", "answered"]) {
      await store.complete(USER, key, await tokenOf(key), 201, '{"id":"offer-1"}');
    }
    await tokenOf("running");
    await db.query(
      `UPDATE "IdempotencyKey" SET "createdAt" = now() - interval '25 hours' WHERE key = 'expired'`,
    );

    await store.purgeExpired();

    const { rows } = await db.query(
      `SELECT key FROM "IdempotencyKey" WHERE key IN ('expired', 'answered', 'running') ORDER BY key`,
    );
    expect(rows.map((r) => r.key)).toEqual(["answered", "running"]);
  });
});
