// Checks that the timers and the backup promotion wait for the package lock on a real Postgres
// (T376; FR-044, FR-057, FR-059): a third connection holds the lock while two changes queue behind
// it in a fixed order, so the interleaving that broke the rows happens on every run.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { OfferService } from "../src/services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../src/workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { DecisionWorkflow } from "../src/workflows/decision/DecisionWorkflow.js";
import { OfferRoundWorkflow } from "../src/workflows/offer-round/OfferRoundWorkflow.js";
import { startMigratedDatabase } from "./database.js";

const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const summit: Actor = { userId: "user-s", role: "INVESTOR", investorId: "investor-1" };
const harbor: Actor = { userId: "user-h", role: "INVESTOR", investorId: "investor-2" };
const clock = { now: () => new Date() };
const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);

let db: pg.Client;
let holder: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let deals: DealLifecycleWorkflow;
let decisions: DecisionWorkflow;
let offers: OfferService;
let rounds: OfferRoundWorkflow;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  holder = new pg.Client({ connectionString: url });
  await holder.connect();
  prisma = createPrismaClient(url);
  const uow = new PrismaUnitOfWorkImpl(prisma, cipher);
  deals = new DealLifecycleWorkflow(uow, { clock });
  decisions = new DecisionWorkflow(uow, { clock });
  offers = new OfferService(uow, { clock });
  rounds = new OfferRoundWorkflow(uow);
  await db.query(`
    INSERT INTO "ConfigEntry" (key, value, "updatedAt") VALUES
      ('reconfirmHours', '48', now()),
      ('netProceeds', '{"closingCostPct": 0.02, "flatFees": 1500}', now());
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now()),
             ('investor-2', 'Harbor', 'Hal', 'harbor@example.test', 'DIRECT_BUYER', now());
  `);
});

afterAll(async () => {
  await holder?.end();
  await prisma?.$disconnect();
  await stop?.();
});

/** A package in the given status, matched to Summit, with an offer in each status given. */
async function listing(n: string, status: string, withOffers: { won?: string; other?: string }) {
  await db.query(`
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-${n}', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-${n}', '${cipher.encrypt(`${n} Elm St`)}', 'hash-${n}', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "offerDeadline", "listingVersion", "updatedAt")
      VALUES ('package-${n}', 'agent-a', 'seller-${n}', 'property-${n}', 'hash-${n}', 250000, 300000, '${status}', now() + interval '3 days', 1, now());
    INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
      VALUES ('match-${n}', 'package-${n}', 'investor-1', 1, '{box-1}', 'PUBLISH');
  `);
  for (const [id, investor, offerStatus] of [
    [`first-${n}`, "investor-1", withOffers.won],
    [`second-${n}`, "investor-2", withOffers.other],
  ]) {
    if (!offerStatus) continue;
    await db.query(
      `INSERT INTO "Offer" (id, "packageId", "investorId", round, status, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
         VALUES ($1, $2, $3, 1, $4, 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now())`,
      [id, `package-${n}`, investor, offerStatus],
    );
  }
}

const one = async (sql: string, id: string) => (await db.query(sql, [id])).rows[0];

/** Waits until `count` sessions are queued for a lock; a change that never queues fails the test. */
async function lockWaiters(count: number) {
  for (const giveUp = Date.now() + 10_000; Date.now() < giveUp;) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].n >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await holder.query("ROLLBACK");
  throw new Error(`Fewer than ${count} changes queued for the package lock`);
}

/**
 * Holds the package's lock while `first`, then `second`, queue behind it, then lets them go:
 * Postgres hands a row to its waiters in the order they came, so `first` always commits first.
 */
async function inOrder(
  packageId: string,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  await holder.query("BEGIN");
  await holder.query(`SELECT id FROM "ListingPackage" WHERE id = $1 FOR UPDATE`, [packageId]);
  const a = first();
  await lockWaiters(1);
  const b = second();
  await lockWaiters(2);
  await holder.query("COMMIT");
  return Promise.allSettled([a, b]);
}

describe("changes that wait for the package lock", () => {
  it("refuses to promote a backup withdrawn while the promotion waited", async () => {
    await listing("1", "OFFER_ACCEPTED", { won: "ACCEPTED", other: "BACKUP" });
    await db.query(`INSERT INTO "Deal" (id, "packageId", "offerId", status, "updatedAt")
      VALUES ('deal-1', 'package-1', 'first-1', 'OFFER_ACCEPTED', now())`);
    await deals.fallThrough(avery, "deal-1", { reason: "Financing fell through", version: 1 });
    const { version } = await one(
      `SELECT version FROM "ListingPackage" WHERE id = $1`,
      "package-1",
    );

    const [withdrawn, promoted] = await inOrder(
      "package-1",
      () => offers.withdraw(harbor, "second-1", { version: 1 }),
      () => deals.promoteBackup(avery, "package-1", { offerId: "second-1", version }),
    );

    expect(withdrawn.status).toBe("fulfilled");
    expect(promoted).toMatchObject({ status: "rejected", reason: { code: "NOT_A_BACKUP" } });
    expect(
      await one(`SELECT count(*)::int AS n FROM "Deal" WHERE "offerId" = $1`, "second-1"),
    ).toEqual({ n: 0 });
  });

  it("counts an offer made just before the deadline when the round closes", async () => {
    await listing("2", "ACCEPTING_OFFERS", {});
    // The column has no time zone and holds UTC; node-pg would read it as local time.
    const { ms } = await one(
      `SELECT (extract(epoch FROM "offerDeadline") * 1000)::bigint AS ms FROM "ListingPackage" WHERE id = $1`,
      "package-2",
    );

    const [made, closed] = await inOrder(
      "package-2",
      () =>
        offers.create(summit, "package-2", {
          price: 280_000,
          paymentType: "CASH",
          closingDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
          earnestMoney: 5_000,
          contingencies: [],
          feesAndConcessions: 0,
          expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        }),
      () =>
        rounds.closeRound({
          packageId: "package-2",
          round: 1,
          offerDeadline: new Date(Number(ms)).toISOString(),
        }),
    );

    expect([made.status, closed.status]).toEqual(["fulfilled", "fulfilled"]);
    expect(await one(`SELECT status FROM "ListingPackage" WHERE id = $1`, "package-2")).toEqual({
      status: "ACCEPTING_OFFERS",
    });
  });

  it("expires an offer that became a backup while its expiry waited", async () => {
    await listing("3", "ACCEPTING_OFFERS", { won: "ACTIVE", other: "ACTIVE" });

    const [accepted, expired] = await inOrder(
      "package-3",
      () =>
        decisions.record(avery, "package-3", { type: "ACCEPT", offerId: "first-3", version: 1 }),
      () => rounds.expireOffer({ offerId: "second-3", revision: 1 }),
    );

    expect([accepted.status, expired.status]).toEqual(["fulfilled", "fulfilled"]);
    expect(await one(`SELECT status FROM "Offer" WHERE id = $1`, "second-3")).toEqual({
      status: "EXPIRED",
    });
  });
});
