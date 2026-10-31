// Checks the ListingPackage table against a real Postgres: one package per address (the sprint's
// duplicate-address block, FR-013) and a price range whose minimum is positive and ≤ the maximum.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(
    `INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
     VALUES ('agent-1', 'Avery Agent', 'avery@example.test', 'Demo Realty', now())`,
  );
});

afterAll(() => stop?.());

let n = 0;
/** Inserts a seller, a property, and a draft package for them; returns the package insert. */
async function insertPackage(addressHash: string, min: number, max: number) {
  const id = `${++n}`;
  await db.query(
    `INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ($1, 'v1:name', 'v1:email', now())`,
    [`seller-${id}`],
  );
  await db.query(
    `INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
     VALUES ($1, 'v1:street', $2, '78701', 'Austin', 'TX', 'SINGLE_FAMILY', now())`,
    [`property-${id}`, addressHash],
  );
  return db.query(
    `INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", "updatedAt")
     VALUES ($1, 'agent-1', $2, $3, $4, $5, $6, now())`,
    [`package-${id}`, `seller-${id}`, `property-${id}`, addressHash, min, max],
  );
}

describe("ListingPackage table", () => {
  it("blocks a second package for an address that already has one", async () => {
    await expect(insertPackage("hash-elm-st", 300_000, 350_000)).resolves.toBeDefined();
    await expect(insertPackage("hash-elm-st", 300_000, 350_000)).rejects.toThrow(
      "ListingPackage_addressHash_key",
    );
  });

  it("requires a positive minimum price no higher than the maximum", async () => {
    await expect(insertPackage("hash-oak-st", 350_000, 300_000)).rejects.toThrow(
      "ListingPackage_price_check",
    );
    await expect(insertPackage("hash-pine-st", 0, 300_000)).rejects.toThrow(
      "ListingPackage_price_check",
    );
  });
});
