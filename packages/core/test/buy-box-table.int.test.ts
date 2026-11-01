// Checks the BuyBox table's value rules against a real Postgres (T279, constitution XIX.2): the
// database refuses an inverted range, an empty list (null, not [], means "any"), and an
// out-of-range closing speed, and lets an investor mark only one box as the default.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(
    `INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
     VALUES ('investor-1', 'Summit Capital', 'Sam Summit', 'summit@example.test', 'DIRECT_BUYER', now())`,
  );
});

afterAll(() => stop?.());

/** Inserts a NATIONWIDE box for investor-1 with the given columns set. */
const insertBox = (columns: Record<string, unknown> = {}) => {
  n += 1;
  const all = { id: `box-${n}`, name: `Box ${n}`, ...columns };
  const names = Object.keys(all).map((c) => `"${c}"`);
  const params = Object.values(all);
  return db.query(
    `INSERT INTO "BuyBox" ("investorId", "geographyMode", "updatedAt", ${names.join(", ")})
     VALUES ('investor-1', 'NATIONWIDE', now(), ${params.map((_, i) => `$${i + 1}`).join(", ")})`,
    params,
  );
};

describe("BuyBox table", () => {
  it("refuses a range whose minimum is above its maximum", async () => {
    await expect(insertBox({ priceMin: 100_000, priceMax: 300_000 })).resolves.toBeDefined();
    for (const [min, max] of [
      ["priceMin", "priceMax"],
      ["yearBuiltMin", "yearBuiltMax"],
      ["bedsMin", "bedsMax"],
      ["bathsMin", "bathsMax"],
      ["sqftMin", "sqftMax"],
      ["unitsMin", "unitsMax"],
    ] as const) {
      await expect(insertBox({ [min]: 5, [max]: 4 })).rejects.toThrow(/BuyBox_.*_range_check/);
    }
  });

  it("treats null as any type and refuses an empty list", async () => {
    await expect(insertBox({ propertyTypes: null })).resolves.toBeDefined();
    await expect(insertBox({ propertyTypes: "{SINGLE_FAMILY}" })).resolves.toBeDefined();
    await expect(insertBox({ propertyTypes: "{}" })).rejects.toThrow(/BuyBox_propertyTypes_check/);
    await expect(insertBox({ conditionsAccepted: "{}" })).rejects.toThrow(
      /BuyBox_conditionsAccepted_check/,
    );
    await expect(insertBox({ programsAccepted: "{}" })).rejects.toThrow(
      /BuyBox_programsAccepted_check/,
    );
  });

  it("keeps the closing speed between 7 and 120 days", async () => {
    await expect(insertBox({ closeWithinDays: 30 })).resolves.toBeDefined();
    await expect(insertBox({ closeWithinDays: 6 })).rejects.toThrow(/BuyBox_closeWithinDays_check/);
    await expect(insertBox({ closeWithinDays: 121 })).rejects.toThrow(
      /BuyBox_closeWithinDays_check/,
    );
  });

  it("lets an investor have only one default box", async () => {
    await expect(insertBox({ isDefault: true })).resolves.toBeDefined();
    await expect(insertBox({ isDefault: false })).resolves.toBeDefined();
    await expect(insertBox({ isDefault: true })).rejects.toThrow(/BuyBox_one_default_per_investor/);
  });
});
