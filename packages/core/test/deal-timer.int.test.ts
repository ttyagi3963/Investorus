// Checks the promoted backup's timer against a real Postgres (T311; FR-057, FR-059, XII): the
// 48-hour reconfirmation job survives a restart (a new client and new handlers), runs once when
// the clock reaches it, and releases the backup; and the fall-through reason is stored encrypted.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
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

let db: pg.Client;
let url: string;
let stop: () => Promise<void>;
const clients: PrismaClient[] = [];
const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const HOUR = 3_600_000;

/** One process's view of the database: what the api or a worker builds when it starts. */
function boot(now: () => Date) {
  const prisma = createPrismaClient(url);
  clients.push(prisma);
  const uow = new PrismaUnitOfWorkImpl(prisma, cipher);
  const clock = { now };
  const deals = new DealLifecycleWorkflow(uow, { clock });
  const handlers = createJobHandlers({
    matching: new MatchingWorkflow(uow, { clock }),
    offerRound: new OfferRoundWorkflow(uow),
    deals,
  });
  return { uow, deals, handlers };
}

beforeAll(async () => {
  ({ db, url, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "ConfigEntry" (key, value, "updatedAt") VALUES
      ('reconfirmHours', '48', now()),
      ('netProceeds', '{"closingCostPct": 0.02, "flatFees": 1500}', now());
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now()),
             ('investor-2', 'Harbor', 'Hal', 'harbor@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', '${cipher.encrypt("12 Elm St")}', 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-1', 'agent-a', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'OFFER_ACCEPTED', now());
    INSERT INTO "Offer" (id, "packageId", "investorId", round, status, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
      VALUES ('offer-1', 'package-1', 'investor-1', 1, 'ACCEPTED', 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now()),
             ('offer-2', 'package-1', 'investor-2', 1, 'BACKUP', 275000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now());
    INSERT INTO "Deal" (id, "packageId", "offerId", status, "updatedAt")
      VALUES ('deal-1', 'package-1', 'offer-1', 'OFFER_ACCEPTED', now());
  `);
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  await stop?.();
});

describe("the reconfirmation timer", () => {
  it("survives a restart, runs once at 48 hours, and releases the backup; the reason is stored encrypted", async () => {
    const start = new Date();
    const api = boot(() => start);
    await api.deals.fallThrough(avery, "deal-1", {
      reason: "Maria Lopez's lender pulled out",
      version: 1,
    });
    await api.deals.promoteBackup(avery, "package-1", { offerId: "offer-2", version: 2 });

    // A worker that starts later, as after a restart, finds the job and waits for its time.
    const later = new Date(start.getTime() + 48 * HOUR + 1_000);
    const worker = boot(() => later);
    const claim = (at: Date) => worker.uow.run((repos) => repos.jobs.claimNext("worker-b", at));
    expect(await claim(start)).toBeNull();
    const job = await claim(later);
    expect(job).toMatchObject({ type: "EXPIRE_RECONFIRMATION" });
    await worker.handlers[job!.type](job!.payload);
    await worker.uow.run((repos) => repos.jobs.complete(job!.id));
    expect(await claim(later)).toBeNull();

    const rows = await db.query(
      `SELECT status, "fellThroughReason" FROM "Deal" ORDER BY "createdAt"`,
    );
    expect(rows.rows.map((r) => r.status)).toEqual(["FELL_THROUGH", "RECONFIRM_DECLINED"]);
    expect(rows.rows[0].fellThroughReason).not.toContain("Maria");
    const offer = await db.query(`SELECT status FROM "Offer" WHERE id = 'offer-2'`);
    expect(offer.rows[0].status).toBe("DECLINED_TO_RECONFIRM");
  });
});
