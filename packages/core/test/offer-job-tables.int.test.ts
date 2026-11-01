// Checks the Job, Offer, and OfferRevision rules against a real Postgres (T281): one live job per
// (type, dedupeKey), so a match run is never queued twice; one live offer per investor, package,
// and round (FR-042), with sane terms and FINANCING listed on a financed offer; and offer
// revisions that can be added but never changed.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-1', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit Capital', 'Sam Summit', 'summit@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', 'v1:z', 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-1', 'agent-1', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'ACCEPTING_OFFERS', now());
  `);
});

afterAll(() => stop?.());

const insertJob = (status: string) =>
  db.query(
    `INSERT INTO "Job" (id, type, status, "dedupeKey", payload, "updatedAt")
     VALUES ($1, 'MATCH_PACKAGE', $2, 'MATCH_PACKAGE:package-1:1:1', '{}', now())
     RETURNING id`,
    [`job-${++n}`, status],
  );

const insertOffer = (
  terms: { status?: string; price?: number; paymentType?: string; contingencies?: string } = {},
) =>
  db.query(
    `INSERT INTO "Offer" (id, "packageId", "investorId", round, status, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
     VALUES ($1, 'package-1', 'investor-1', 1, $2, $3, $4, '2026-12-15', 5000, $5, 0, now() + interval '7 days', now())
     RETURNING id`,
    [
      `offer-${++n}`,
      terms.status ?? "ACTIVE",
      terms.price ?? 280_000,
      terms.paymentType ?? "CASH",
      terms.contingencies ?? "{INSPECTION}",
    ],
  );

describe("Job table", () => {
  it("allows one live job per dedupe key, and a new one once it finishes", async () => {
    const first = await insertJob("QUEUED");
    await expect(insertJob("QUEUED")).rejects.toThrow("Job_one_live_per_dedupe_key");
    await db.query(`UPDATE "Job" SET status = 'COMPLETED' WHERE id = $1`, [first.rows[0].id]);
    await expect(insertJob("QUEUED")).resolves.toBeDefined();
  });
});

describe("Offer table", () => {
  it("allows one live offer per investor per package per round, and a new one after a decline", async () => {
    const first = await insertOffer({ status: "BACKUP" });
    await expect(insertOffer()).rejects.toThrow("Offer_one_live_per_investor");
    await db.query(`UPDATE "Offer" SET status = 'DECLINED' WHERE id = $1`, [first.rows[0].id]);
    await expect(insertOffer()).resolves.toBeDefined();
  });

  it("refuses a price of zero and a financed offer without the financing contingency", async () => {
    await expect(insertOffer({ status: "DECLINED", price: 0 })).rejects.toThrow(
      "Offer_price_check",
    );
    await expect(
      insertOffer({ status: "DECLINED", paymentType: "FINANCED", contingencies: "{INSPECTION}" }),
    ).rejects.toThrow("Offer_financing_check");
    await expect(
      insertOffer({ status: "DECLINED", paymentType: "FINANCED", contingencies: "{FINANCING}" }),
    ).resolves.toBeDefined();
  });

  it("never lets an offer revision be changed or deleted", async () => {
    const offer = await insertOffer({ status: "DECLINED" });
    await db.query(
      `INSERT INTO "OfferRevision" (id, "offerId", revision, terms) VALUES ('rev-1', $1, 1, '{"price":280000}')`,
      [offer.rows[0].id],
    );
    await expect(
      db.query(`UPDATE "OfferRevision" SET terms = '{}' WHERE id = 'rev-1'`),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM "OfferRevision" WHERE id = 'rev-1'`)).rejects.toThrow(
      /append-only/,
    );
  });
});
