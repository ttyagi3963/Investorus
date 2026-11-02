// Checks a promoted backup's reconfirmation racing its own withdrawal on a real Postgres (T365;
// FR-057, FR-059): run from two connections at once, exactly one wins, and the rows always agree:
// a withdrawn offer's deal is declined, and only a still-live backup becomes the accepted offer.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { OfferService } from "../src/services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../src/workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { startMigratedDatabase } from "./database.js";

const ROUNDS = 10;
const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const harbor: Actor = { userId: "user-h", role: "INVESTOR", investorId: "investor-2" };
const clock = { now: () => new Date() };

let db: pg.Client;
let stop: () => Promise<void>;
const clients: PrismaClient[] = [];

/** One process's services on its own connection pool, as the api runs them. */
function connect(url: string) {
  const prisma = createPrismaClient(url);
  clients.push(prisma);
  const uow = new PrismaUnitOfWorkImpl(prisma, cipher);
  return {
    deals: new DealLifecycleWorkflow(uow, { clock }),
    offers: new OfferService(uow, { clock }),
  };
}
let first: ReturnType<typeof connect>;
let second: ReturnType<typeof connect>;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  first = connect(url);
  second = connect(url);
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
  await Promise.all(clients.map((client) => client.$disconnect()));
  await stop?.();
});

/** A package whose accepted deal falls through, then the agent promotes its one backup. */
async function promotedBackup(round: number) {
  const n = `${round}`;
  await db.query(`
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-${n}', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-${n}', '${cipher.encrypt(`${n} Elm St`)}', 'hash-${n}', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-${n}', 'agent-a', 'seller-${n}', 'property-${n}', 'hash-${n}', 250000, 300000, 'OFFER_ACCEPTED', now());
    INSERT INTO "Offer" (id, "packageId", "investorId", round, status, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
      VALUES ('won-${n}', 'package-${n}', 'investor-1', 1, 'ACCEPTED', 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now()),
             ('backup-${n}', 'package-${n}', 'investor-2', 1, 'BACKUP', 275000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now());
    INSERT INTO "Deal" (id, "packageId", "offerId", status, "updatedAt")
      VALUES ('deal-${n}', 'package-${n}', 'won-${n}', 'OFFER_ACCEPTED', now());
  `);
  await first.deals.fallThrough(avery, `deal-${n}`, {
    reason: "Financing fell through",
    version: 1,
  });
  const pkg = await db.query(`SELECT version FROM "ListingPackage" WHERE id = $1`, [
    `package-${n}`,
  ]);
  await first.deals.promoteBackup(avery, `package-${n}`, {
    offerId: `backup-${n}`,
    version: pkg.rows[0].version,
  });
  const offer = await db.query(`SELECT version FROM "Offer" WHERE id = $1`, [`backup-${n}`]);
  return { offerId: `backup-${n}`, offerVersion: offer.rows[0].version as number };
}

describe("a promoted backup's reconfirmation racing its withdrawal", () => {
  it("lets exactly one win, and never leaves a withdrawn offer accepted", async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const { offerId, offerVersion } = await promotedBackup(round);

      const results = await Promise.allSettled([
        first.deals.reconfirm(harbor, offerId, { action: "CONFIRM" }),
        second.offers.withdraw(harbor, offerId, { version: offerVersion }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const { rows } = await db.query(
        `SELECT o.status AS offer, d.status AS deal
           FROM "Offer" o JOIN "Deal" d ON d."offerId" = o.id WHERE o.id = $1`,
        [offerId],
      );
      expect([
        { offer: "ACCEPTED", deal: "OFFER_ACCEPTED" },
        { offer: "WITHDRAWN", deal: "RECONFIRM_DECLINED" },
      ]).toContainEqual(rows[0]);
    }
  });
});
