// Checks the ListingPackage table against a real Postgres: one active package per address (the
// duplicate-address block, FR-013), which a withdrawn package no longer holds; a price range whose
// minimum is positive and ≤ the maximum; a closing window that starts no later than it ends; and
// listing versions that can never be changed or deleted.
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
/** Inserts a seller, a property, and a package for them; returns the package's id. */
async function insertPackage(
  addressHash: string,
  min: number,
  max: number,
  extra: { status?: string; closingWindowStart?: string; closingWindowEnd?: string } = {},
) {
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
  await db.query(
    `INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "closingWindowStart", "closingWindowEnd", "updatedAt")
     VALUES ($1, 'agent-1', $2, $3, $4, $5, $6, $7, $8, $9, now())`,
    [
      `package-${id}`,
      `seller-${id}`,
      `property-${id}`,
      addressHash,
      min,
      max,
      extra.status ?? "DRAFT",
      extra.closingWindowStart ?? null,
      extra.closingWindowEnd ?? null,
    ],
  );
  return `package-${id}`;
}

describe("ListingPackage table", () => {
  it("allows one active package per address, and a withdrawn one frees the address", async () => {
    const first = await insertPackage("hash-elm-st", 300_000, 350_000);
    await expect(insertPackage("hash-elm-st", 300_000, 350_000)).rejects.toThrow(
      "ListingPackage_one_active_per_address",
    );
    await db.query(`UPDATE "ListingPackage" SET status = 'WITHDRAWN' WHERE id = $1`, [first]);
    await expect(insertPackage("hash-elm-st", 300_000, 350_000)).resolves.toBeDefined();
  });

  it("requires a positive minimum price no higher than the maximum", async () => {
    await expect(insertPackage("hash-oak-st", 350_000, 300_000)).rejects.toThrow(
      "ListingPackage_price_check",
    );
    await expect(insertPackage("hash-pine-st", 0, 300_000)).rejects.toThrow(
      "ListingPackage_price_check",
    );
  });

  it("refuses a closing window that ends before it starts", async () => {
    await expect(
      insertPackage("hash-ash-st", 300_000, 350_000, {
        closingWindowStart: "2026-12-01",
        closingWindowEnd: "2026-11-15",
      }),
    ).rejects.toThrow("ListingPackage_closingWindow_check");
  });

  it("never lets a listing version be changed or deleted", async () => {
    const pkg = await insertPackage("hash-birch-st", 300_000, 350_000);
    await db.query(
      `INSERT INTO "ListingVersion" (id, "packageId", "listingVersion", round, snapshot, "evaluatorVersion")
       VALUES ('lv-1', $1, 1, 1, '{"zip":"78701"}', 1)`,
      [pkg],
    );
    await expect(
      db.query(`UPDATE "ListingVersion" SET snapshot = '{}' WHERE id = 'lv-1'`),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM "ListingVersion" WHERE id = 'lv-1'`)).rejects.toThrow(
      /append-only/,
    );
  });
});
