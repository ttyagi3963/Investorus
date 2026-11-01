// Checks stage 1 of matching against a real Postgres (T288; FR-024, XIX.4): it returns every box
// that covers the listing's ZIP or state, or is nationwide, and drops only paused boxes, inactive
// investors, expired proof of funds, and other places. A NULL list criterion reads back as "any".
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  await db.query(`
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", status, "proofOfFundsExpiresAt", "updatedAt") VALUES
      ('funded', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', 'ACTIVE', now() + interval '1 year', now()),
      ('expired', 'Harbor', 'Hal', 'harbor@example.test', 'DIRECT_BUYER', 'ACTIVE', now() - interval '1 day', now()),
      ('inactive', 'Ridge', 'Rae', 'ridge@example.test', 'DIRECT_BUYER', 'INACTIVE', now() + interval '1 year', now());
    INSERT INTO "BuyBox" (id, "investorId", name, status, "geographyMode", "propertyTypes", "updatedAt") VALUES
      ('zip-box', 'funded', 'Zip', 'ACTIVE', 'ZIPS', '{SINGLE_FAMILY}', now()),
      ('state-box', 'funded', 'State', 'ACTIVE', 'STATES', NULL, now()),
      ('nationwide-box', 'funded', 'Nationwide', 'ACTIVE', 'NATIONWIDE', NULL, now()),
      ('elsewhere-box', 'funded', 'Elsewhere', 'ACTIVE', 'ZIPS', NULL, now()),
      ('paused-box', 'funded', 'Paused', 'PAUSED', 'NATIONWIDE', NULL, now()),
      ('expired-box', 'expired', 'Expired', 'ACTIVE', 'NATIONWIDE', NULL, now()),
      ('inactive-box', 'inactive', 'Inactive', 'ACTIVE', 'NATIONWIDE', NULL, now());
    INSERT INTO "BuyBoxGeography" (id, "buyBoxId", kind, value) VALUES
      ('g1', 'zip-box', 'ZIP', '78704'),
      ('g2', 'state-box', 'STATE', 'TX'),
      ('g3', 'elsewhere-box', 'ZIP', '10001');
  `);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("BuyBox listCandidates", () => {
  it("keeps every box that covers the listing and drops only the hard cuts and other places", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const boxes = await uow.run((repos) =>
      repos.buyBoxes.listCandidates("78704", "TX", new Date()),
    );
    expect(boxes.map((b) => b.id).sort()).toEqual(["nationwide-box", "state-box", "zip-box"]);
    const byId = Object.fromEntries(boxes.map((b) => [b.id, b]));
    expect(byId["zip-box"]).toMatchObject({
      geography: ["78704"],
      propertyTypes: ["SINGLE_FAMILY"],
    });
    expect(byId["state-box"]).toMatchObject({ geography: ["TX"], propertyTypes: null });
  });
});
