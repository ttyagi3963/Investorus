// Checks that a deadline job is safe to run twice on a real Postgres (T368; FR-072): the worker runs
// the round-close job and its change commits, then the worker dies before marking the job done; the
// stale-job sweep puts the job back and it runs again. The agent is told, and the round audited,
// exactly once.
import { randomBytes } from "node:crypto";
import type { CloseOfferRoundPayload } from "@clever/contracts/jobs";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobHandlers } from "../src/jobs/handlers.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../src/workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { MatchingWorkflow } from "../src/workflows/matching/MatchingWorkflow.js";
import { OfferRoundWorkflow } from "../src/workflows/offer-round/OfferRoundWorkflow.js";
import { startMigratedDatabase } from "./database.js";

const DEADLINE = "2026-11-03T12:00:00.000Z";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let uow: PrismaUnitOfWorkImpl;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
  uow = new PrismaUnitOfWorkImpl(prisma, cipher);
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "updatedAt")
      VALUES ('user-a', 'avery@example.test', 'hash', 'AGENT', 'Avery', 'agent-a', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', '${cipher.encrypt("12 Elm St")}', 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "offerDeadline", "updatedAt")
      VALUES ('package-1', 'agent-a', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'ACCEPTING_OFFERS', '${DEADLINE}', now());
    INSERT INTO "Offer" (id, "packageId", "investorId", round, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
      VALUES ('offer-1', 'package-1', 'investor-1', 1, 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now());
  `);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("a deadline job that runs again after its worker died", () => {
  it("tells the agent and audits the round exactly once", async () => {
    const clock = { now: () => new Date("2026-11-04T00:00:00Z") };
    const handlers = createJobHandlers({
      matching: new MatchingWorkflow(uow, { clock }),
      offerRound: new OfferRoundWorkflow(uow),
      deals: new DealLifecycleWorkflow(uow, { clock }),
      imports: { run: () => Promise.reject(new Error("No imports in this test")) },
      digests: { send: () => Promise.reject(new Error("No digests in this test")) },
    });
    const payload: CloseOfferRoundPayload = {
      packageId: "package-1",
      round: 1,
      offerDeadline: DEADLINE,
    };
    await uow.run((repos) =>
      repos.jobs.enqueue({
        type: "CLOSE_OFFER_ROUND",
        dedupeKey: `CLOSE_OFFER_ROUND:package-1:1:${DEADLINE}`,
        payload,
        runAt: new Date(DEADLINE),
      }),
    );

    // First run: the change commits, then the worker dies before marking the job done.
    const first = (await uow.run((repos) => repos.jobs.claimNext("worker-1", clock.now())))!;
    await handlers[first.type](first.payload);

    // The stale-job sweep puts it back, and another worker runs it to completion.
    await db.query(`UPDATE "Job" SET "lockedAt" = now() - interval '1 hour' WHERE id = $1`, [
      first.id,
    ]);
    expect(await uow.run((repos) => repos.jobs.reclaimStale(60))).toBe(1);
    const again = (await uow.run((repos) => repos.jobs.claimNext("worker-2", clock.now())))!;
    expect(again.id).toBe(first.id);
    await handlers[again.type](again.payload);
    await uow.run((repos) => repos.jobs.complete(again.id));

    const told = await db.query(`SELECT count(*) FROM "Notification" WHERE "userId" = 'user-a'`);
    const audited = await db.query(
      `SELECT count(*) FROM "AuditLog" WHERE action = 'OFFER_ROUND_CLOSED'`,
    );
    expect([Number(told.rows[0].count), Number(audited.rows[0].count)]).toEqual([1, 1]);
  });
});
