// Guards encryption at rest (constitution XII, XX.1; T225): a seller and a street saved through the
// repositories are ciphertext in the database, and reading them back returns the original values.
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
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("PII at rest", () => {
  it("stores the seller's details and the street as ciphertext and reads them back", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const { seller, property } = await uow.run(async (repos) => ({
      seller: await repos.sellers.create({
        fullName: "Maria Lopez",
        email: "maria@example.com",
        phone: "+15551234567",
      }),
      property: await repos.properties.create({
        streetLine: "12 Elm St",
        addressHash: "hash-elm",
        zip: "78701",
        city: "Austin",
        state: "TX",
        neighborhood: null,
        propertyType: "SINGLE_FAMILY",
        beds: 3,
        baths: 2.5,
        sqft: 1800,
        lotSqft: null,
        units: null,
        yearBuilt: 1998,
        condition: "GOOD",
        repairEstimate: null,
      }),
    }));

    const raw = await db.query(
      `SELECT s."fullName", s.email, s.phone, p."streetLine"
       FROM "Seller" s, "Property" p WHERE s.id = $1 AND p.id = $2`,
      [seller.id, property.id],
    );
    const stored = Object.values(raw.rows[0] as Record<string, string>);
    expect(stored.every((v) => v.startsWith("v1:"))).toBe(true);
    expect(stored.join(" ")).not.toMatch(/Maria|maria@example|5551234567|Elm/);

    const back = await uow.run(async (repos) => ({
      seller: await repos.sellers.findById(seller.id),
      property: await repos.properties.findById(property.id),
    }));
    expect(back.seller).toMatchObject({
      fullName: "Maria Lopez",
      email: "maria@example.com",
      phone: "+15551234567",
    });
    expect(back.property).toMatchObject({ streetLine: "12 Elm St", baths: 2.5 });
  });
});
