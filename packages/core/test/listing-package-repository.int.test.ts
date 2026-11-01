// Guards the two rules the listing-package queries enforce against a real Postgres: an agent can
// only load their own package, and an edit based on a stale version is refused (T247).
import { randomBytes } from "node:crypto";
import { ConflictError } from "@clever/contracts/common";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let uow: PrismaUnitOfWorkImpl;
let stop: () => Promise<void>;
let packageId: string;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt") VALUES
      ('agent-a', 'Avery', 'avery@example.com', 'Demo Realty', now()),
      ('agent-b', 'Blake', 'blake@example.com', 'Demo Realty', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', 'v1:z', 'hash-1', '78701', 'Austin', 'TX', 'SINGLE_FAMILY', now());
  `);
  const created = await uow.run((repos) =>
    repos.packages.create({
      agentId: "agent-a",
      sellerId: "seller-1",
      propertyId: "property-1",
      addressHash: "hash-1",
      priceExpectationMin: 300_000,
      priceExpectationMax: 350_000,
      closingWindowStart: null,
      closingWindowEnd: null,
      currentlyListed: null,
      eligiblePrograms: [],
    }),
  );
  packageId = created.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("listing-package repository", () => {
  it("finds a package only for the agent who owns it", async () => {
    await uow.run(async (repos) => {
      expect(await repos.packages.findForAgent("agent-a", packageId)).not.toBeNull();
      expect(await repos.packages.findForAgent("agent-b", packageId)).toBeNull();
      expect(await repos.packages.listByAgent("agent-b")).toEqual([]);
    });
  });

  it("refuses an update based on a stale version", async () => {
    const updated = await uow.run((repos) =>
      repos.packages.update(packageId, 1, { priceExpectationMax: 360_000 }),
    );
    expect(updated.version).toBe(2);
    await expect(
      uow.run((repos) => repos.packages.update(packageId, 1, { priceExpectationMax: 370_000 })),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("stores a closing window as the exact days given, whatever the server's time zone", async () => {
    process.env.TZ = "America/Los_Angeles";
    const current = await uow.run((repos) => repos.packages.findForAgent("agent-a", packageId));
    await uow.run((repos) =>
      repos.packages.update(packageId, current!.version, {
        closingWindowStart: "2026-12-01",
        closingWindowEnd: "2026-12-31",
      }),
    );
    const saved = await uow.run((repos) => repos.packages.findForAgent("agent-a", packageId));
    expect(saved).toMatchObject({
      closingWindowStart: "2026-12-01",
      closingWindowEnd: "2026-12-31",
    });
  });
});
