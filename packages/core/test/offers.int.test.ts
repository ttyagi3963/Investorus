// Checks the offer rules that need a real Postgres (T296; FR-042): two submits racing for the same
// investor and package leave exactly one offer, the loser told to revise; and a revise keeps every
// earlier set of terms as its own revision.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { OfferService } from "../src/services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
const summit: Actor = { userId: "user-summit", role: "INVESTOR", investorId: "summit" };

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('summit', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', 'v1:z', 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "offerDeadline", "listingVersion", "updatedAt")
      VALUES ('package-1', 'agent-a', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'ACCEPTING_OFFERS', now() + interval '3 days', 1, now());
    INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
      VALUES ('match-1', 'package-1', 'summit', 1, '{box-1}', 'PUBLISH');
  `);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

const terms = (price: number) => ({
  price,
  paymentType: "CASH",
  closingDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  earnestMoney: 5_000,
  contingencies: ["INSPECTION"],
  feesAndConcessions: 0,
  expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
});

describe("offers", () => {
  it("keeps one offer when two submits race, and every revision of its terms", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const offers = new OfferService(uow, { clock: { now: () => new Date() } });
    const results = await Promise.allSettled([
      offers.create(summit, "package-1", terms(280_000)),
      offers.create(summit, "package-1", terms(281_000)),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({ code: "OFFER_EXISTS" });
    const offer = (won[0] as PromiseFulfilledResult<{ id: string; version: number }>).value;

    await offers.revise(summit, offer.id, { ...terms(290_000), version: offer.version });
    const rows = await db.query(
      `SELECT (SELECT count(*) FROM "Offer")::int AS offers,
              (SELECT array_agg((terms->>'price')::int ORDER BY revision) FROM "OfferRevision") AS prices`,
    );
    expect(rows.rows[0]).toEqual({ offers: 1, prices: [expect.any(Number), 290_000] });
  });
});
