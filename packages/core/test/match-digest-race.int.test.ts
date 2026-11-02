// Checks two match digest runs at once on a real Postgres (T379; FR-023): the scheduled run and an
// operator's "send now" have different job keys, so both can run together, and each pending match
// must still reach its investor in exactly one digest email.
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { MatchDigestWorkflow } from "../src/workflows/match-digest/MatchDigestWorkflow.js";
import { startMigratedDatabase } from "./database.js";

const ROUNDS = 5;
const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
const clock = { now: () => new Date() };

let db: pg.Client;
let stop: () => Promise<void>;
const clients: PrismaClient[] = [];

/** One worker's digest workflow on its own connection pool. */
function connect(url: string) {
  const prisma = createPrismaClient(url);
  clients.push(prisma);
  return new MatchDigestWorkflow(new PrismaUnitOfWorkImpl(prisma, cipher), { clock });
}
let first: MatchDigestWorkflow;
let second: MatchDigestWorkflow;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  first = connect(url);
  second = connect(url);
  await db.query(`
    INSERT INTO "ConfigEntry" (key, value, "updatedAt") VALUES ('matchDigest', '{"hourUtc": 14}', now());
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

/** A package taking offers that both investors' edited buy boxes now match. */
async function pendingMatches(round: number) {
  const n = `${round}`;
  await db.query(`
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-${n}', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-${n}', '${cipher.encrypt(`${n} Elm St`)}', 'hash-${n}', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-${n}', 'agent-a', 'seller-${n}', 'property-${n}', 'hash-${n}', 250000, 300000, 'ACCEPTING_OFFERS', now());
    INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
      VALUES ('match-${n}-1', 'package-${n}', 'investor-1', 1, '{box-1}', 'BUY_BOX_CHANGE'),
             ('match-${n}-2', 'package-${n}', 'investor-2', 1, '{box-2}', 'BUY_BOX_CHANGE');
  `);
}

describe("two match digest runs at once", () => {
  it("send each pending match in exactly one digest", async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      await pendingMatches(round);

      await Promise.all([
        first.send({ digestDate: "2026-11-07" }),
        second.send({ digestDate: "2026-11-07" }),
      ]);

      const { rows } = await db.query<{ investorId: string; packages: string[] }>(
        `SELECT payload->>'investorId' AS "investorId",
                array_agg(m->>'packageId') AS packages
           FROM "OutboxEvent", jsonb_array_elements(payload->'matches') m
          WHERE type = 'investor.match_digest' AND m->>'packageId' = $1
          GROUP BY 1 ORDER BY 1`,
        [`package-${round}`],
      );
      expect(rows).toEqual([
        { investorId: "investor-1", packages: [`package-${round}`] },
        { investorId: "investor-2", packages: [`package-${round}`] },
      ]);
    }
  });
});
