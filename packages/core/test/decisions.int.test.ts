// Checks the seller's decision against a real Postgres (T309; FR-053, XII): two agents accepting
// different offers on one package at the same moment end with exactly one deal, and the loser is
// told the package already has an accepted offer; and the agent's note is stored encrypted.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DecisionWorkflow } from "../src/workflows/decision/DecisionWorkflow.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let decisions: DecisionWorkflow;
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
  decisions = new DecisionWorkflow(new PrismaUnitOfWorkImpl(prisma, cipher), {
    clock: { now: () => new Date() },
  });
  await db.query(
    `
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now()),
             ('investor-2', 'Harbor', 'Hal', 'harbor@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', $1, 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-1', 'agent-a', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'ACCEPTING_OFFERS', now());
    INSERT INTO "Offer" (id, "packageId", "investorId", round, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
      VALUES ('offer-1', 'package-1', 'investor-1', 1, 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now()),
             ('offer-2', 'package-1', 'investor-2', 1, 285000, 'CASH', '2026-12-15', 5000, '{}', 0, now() + interval '7 days', now());
  `.replace("$1", `'${cipher.encrypt("12 Elm St")}'`),
  );
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("accepting an offer", () => {
  it("lets exactly one of two simultaneous accepts win, and stores the note encrypted", async () => {
    const note = "Maria Lopez prefers the cash offer";
    const accept = (offerId: string) =>
      decisions.record(avery, "package-1", { type: "ACCEPT", offerId, version: 1, note });

    const results = await Promise.allSettled([accept("offer-1"), accept("offer-2")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [lost] = results.filter((r) => r.status === "rejected");
    expect(lost?.reason).toMatchObject({ code: "PACKAGE_HAS_ACCEPTED_OFFER" });
    const deals = await db.query(`SELECT status FROM "Deal" WHERE "packageId" = 'package-1'`);
    expect(deals.rows).toEqual([{ status: "OFFER_ACCEPTED" }]);
    const stored = await db.query(`SELECT note FROM "Decision"`);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].note).not.toContain("Maria");
  });
});
