// Guards the buy box saves against a real Postgres (T321): a list left blank is stored as NULL
// ("any"; the CHECKs refuse an empty list), a save replaces the geography, a stale version is
// refused, and a name the investor already uses comes back as a field error.
import { randomBytes } from "node:crypto";
import type { BuyBoxInput } from "@clever/contracts/buy-box";
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

const austin: BuyBoxInput = {
  name: "Austin flips",
  strategy: null,
  status: "ACTIVE",
  geographyMode: "ZIPS",
  geography: ["78704", "78745"],
  propertyTypes: ["SINGLE_FAMILY", "TOWNHOME"],
  priceMin: null,
  priceMax: 300_000,
  yearBuiltMin: null,
  yearBuiltMax: null,
  bedsMin: null,
  bedsMax: null,
  bathsMin: null,
  bathsMax: null,
  sqftMin: null,
  sqftMax: null,
  unitsMin: null,
  unitsMax: null,
  conditionsAccepted: ["FAIR"],
  repairMax: null,
  closeWithinDays: null,
  acceptsListed: true,
  programsAccepted: null,
};

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  await db.query(`
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Ridge Investments', 'Rae Ridge', 'ridge@example.test', 'DIRECT_BUYER', now());
  `);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("PrismaBuyBoxRepositoryImpl", () => {
  it("stores a blank list as NULL and replaces the geography on save", async () => {
    const created = await uow.run((repos) => repos.buyBoxes.create("investor-1", austin));
    const saved = await uow.run((repos) =>
      repos.buyBoxes.update(created.id, 1, {
        ...austin,
        geographyMode: "STATES",
        geography: ["TX"],
        propertyTypes: null,
        conditionsAccepted: null,
      }),
    );

    expect(saved).toMatchObject({
      version: 2,
      geographyMode: "STATES",
      geography: ["TX"],
      propertyTypes: null,
      conditionsAccepted: null,
    });
    const { rows } = await db.query(
      `SELECT "propertyTypes", "conditionsAccepted", (SELECT count(*)::int FROM "BuyBoxGeography" g WHERE g."buyBoxId" = b.id) AS places
         FROM "BuyBox" b WHERE id = $1`,
      [created.id],
    );
    expect(rows[0]).toEqual({ propertyTypes: null, conditionsAccepted: null, places: 1 });
  });

  it("refuses a stale save and a name the investor already uses", async () => {
    const box = await uow.run((repos) =>
      repos.buyBoxes.create("investor-1", { ...austin, name: "Texas" }),
    );
    await uow.run((repos) => repos.buyBoxes.update(box.id, 1, { ...austin, name: "Texas" }));

    await expect(
      uow.run((repos) => repos.buyBoxes.update(box.id, 1, { ...austin, name: "Texas" })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      uow.run((repos) => repos.buyBoxes.update(box.id, 2, austin)),
    ).rejects.toMatchObject({
      status: 400,
      details: {
        fields: [{ field: "name", message: "You already have a buy box with this name" }],
      },
    });
  });
});
