// Checks that two changes racing for one unique key on a real Postgres get a clear answer (T383): a
// package created at an address another change is taking is the 409 the duplicate check gives,
// not a 500, and two matching jobs recording the same match keep both boxes. A third connection
// holds the other change's row uncommitted, so the race happens the same way on every run.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let holder: pg.Client;
let prisma: PrismaClient;
let uow: PrismaUnitOfWorkImpl;
let stop: () => Promise<void>;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  holder = new pg.Client({ connectionString: url });
  await holder.connect();
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.com', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now());
  `);
  for (const [n, hash] of [
    ["held", "hash-1"],
    ["racing", "hash-1"],
    ["matched", "hash-2"],
  ]) {
    await db.query(`
      INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-${n}', 'v1:x', 'v1:y', now());
      INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
        VALUES ('property-${n}', 'v1:z', '${hash}', '78701', 'Austin', 'TX', 'SINGLE_FAMILY', now());`);
  }
  await db.query(`
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", "updatedAt")
      VALUES ('package-matched', 'agent-a', 'seller-matched', 'property-matched', 'hash-2', 300000, 350000, now())`);
});

afterAll(async () => {
  await holder?.end();
  await prisma?.$disconnect();
  await stop?.();
});

/** Waits until a change is queued behind the held row; one that never queues fails the test. */
async function queued() {
  for (const giveUp = Date.now() + 10_000; Date.now() < giveUp;) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].n >= 1) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await holder.query("ROLLBACK");
  throw new Error("The change never queued behind the held row");
}

/** Writes `sql` in the holder's open transaction, starts `change`, then commits under it. */
async function racing<T>(sql: string, change: () => Promise<T>) {
  await holder.query("BEGIN");
  await holder.query(sql);
  const result = change();
  await queued();
  await holder.query("COMMIT");
  return result;
}

describe("racing for a unique key", () => {
  it("refuses a package at an address another change just took, as a duplicate listing", async () => {
    const created = racing(
      `INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", "updatedAt")
         VALUES ('package-held', 'agent-a', 'seller-held', 'property-held', 'hash-1', 300000, 350000, now())`,
      () =>
        uow.run((repos) =>
          repos.packages.create({
            agentId: "agent-a",
            sellerId: "seller-racing",
            propertyId: "property-racing",
            addressHash: "hash-1",
            priceExpectationMin: 300_000,
            priceExpectationMax: 350_000,
            closingWindowStart: null,
            closingWindowEnd: null,
            currentlyListed: null,
            eligiblePrograms: [],
          }),
        ),
    );

    await expect(created).rejects.toMatchObject({
      status: 409,
      code: "DUPLICATE_ACTIVE_LISTING",
    });
  });

  it("keeps both boxes when two matching jobs record the same match at once", async () => {
    const recorded = racing(
      `INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
         VALUES ('match-held', 'package-matched', 'investor-1', 1, '{box-a}', 'PUBLISH')`,
      () =>
        uow.run((repos) =>
          repos.matches.upsert({
            packageId: "package-matched",
            investorId: "investor-1",
            round: 1,
            matchedBuyBoxIds: ["box-b"],
            trigger: "BUY_BOX_CHANGE",
          }),
        ),
    );

    await expect(recorded).resolves.toMatchObject({
      created: false,
      match: { id: "match-held", matchedBuyBoxIds: ["box-a", "box-b"], trigger: "PUBLISH" },
    });
    // Only the job that creates the match sends the match notice.
    const next = { packageId: "package-matched", investorId: "investor-1", round: 2 };
    const first = await uow.run((repos) =>
      repos.matches.upsert({ ...next, matchedBuyBoxIds: ["box-a"], trigger: "REOPEN" }),
    );
    expect(first.created).toBe(true);
  });
});
