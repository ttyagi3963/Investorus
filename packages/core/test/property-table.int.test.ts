// Checks the Property table's hand-written CHECKs against a real Postgres: the home facts stay in
// range, and `units` is only for multi-family homes. NULLs pass, so a draft can be incomplete.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
});

afterAll(() => stop?.());

let n = 0;
const insertProperty = (facts: Record<string, string | number>) => {
  const row = { propertyType: "SINGLE_FAMILY", ...facts };
  const columns = Object.keys(row).map((c) => `"${c}"`);
  return db.query(
    `INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, ${columns.join(", ")}, "updatedAt")
     VALUES ($1, 'v1:encrypted-street', $1, '78701', 'Austin', 'TX', ${columns.map((_, i) => `$${i + 2}`).join(", ")}, now())`,
    [`property-${++n}`, ...Object.values(row)],
  );
};

describe("Property table", () => {
  it("keeps the home facts in range", async () => {
    await expect(insertProperty({ beds: 3, baths: 2.5, sqft: 1800 })).resolves.toBeDefined();
    const outOfRange: [Record<string, number>, string][] = [
      [{ beds: 21 }, "Property_beds_check"],
      [{ baths: 2.3 }, "Property_baths_check"],
      [{ sqft: 0 }, "Property_sqft_check"],
      [{ lotSqft: 0 }, "Property_lotSqft_check"],
      [{ yearBuilt: 1799 }, "Property_yearBuilt_check"],
      [{ repairEstimate: -1 }, "Property_repairEstimate_check"],
    ];
    for (const [facts, constraint] of outOfRange) {
      await expect(insertProperty(facts)).rejects.toThrow(constraint);
    }
  });

  it("allows units only on a multi-family home, 2 to 500", async () => {
    await expect(insertProperty({ propertyType: "MULTI_FAMILY", units: 4 })).resolves.toBeDefined();
    await expect(insertProperty({ units: 4 })).rejects.toThrow("Property_units_check");
    await expect(insertProperty({ propertyType: "MULTI_FAMILY", units: 1 })).rejects.toThrow(
      "Property_units_check",
    );
  });
});
