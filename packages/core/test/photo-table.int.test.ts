// Checks the Photo table's hand-written CHECKs against a real Postgres: an accepted image type, a
// size up to 10 MB, and a position 0–19 (so at most 20 photos per package).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt") VALUES ('agent-1', 'A', 'a@example.test', 'B', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:name', 'v1:email', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', 'v1:street', 'hash-1', '78701', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", "updatedAt")
      VALUES ('package-1', 'agent-1', 'seller-1', 'property-1', 'hash-1', 300000, 350000, now());
  `);
});

afterAll(() => stop?.());

let n = 0;
const insertPhoto = (contentType: string, sizeBytes: number, position: number) =>
  db.query(
    `INSERT INTO "Photo" (id, "packageId", "storageKey", "contentType", "sizeBytes", position)
     VALUES ($1, 'package-1', $1, $2, $3, $4)`,
    [`photo-${++n}`, contentType, sizeBytes, position],
  );

describe("Photo table", () => {
  it("accepts only JPEG, PNG, or WebP up to 10 MB, at positions 0 to 19", async () => {
    await expect(insertPhoto("image/jpeg", 10 * 1024 * 1024, 19)).resolves.toBeDefined();
    await expect(insertPhoto("image/gif", 1000, 0)).rejects.toThrow("Photo_contentType_check");
    await expect(insertPhoto("image/png", 10 * 1024 * 1024 + 1, 1)).rejects.toThrow(
      "Photo_sizeBytes_check",
    );
    await expect(insertPhoto("image/webp", 1000, 20)).rejects.toThrow("Photo_position_check");
  });
});
