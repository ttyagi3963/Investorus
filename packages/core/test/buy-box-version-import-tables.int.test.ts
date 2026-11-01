// Checks the Sprint 4 table rules against a real Postgres (T319): a buy box version is history that
// can never be changed, and an import row result either names the investor it created or updated,
// or says why the row was rejected, never both (FR-061).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit Capital', 'Sam Summit', 'summit@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "BuyBox" (id, "investorId", name, "geographyMode", "updatedAt")
      VALUES ('box-1', 'investor-1', 'Anywhere', 'NATIONWIDE', now());
    INSERT INTO "BuyBoxVersion" (id, "buyBoxId", version, snapshot)
      VALUES ('version-1', 'box-1', 1, '{}');
    INSERT INTO "ImportBatch" (id, "fileName", "storageKey", "createdBy")
      VALUES ('batch-1', 'investors.csv', 'imports/batch-1.csv', 'user-ops');
  `);
});

afterAll(() => stop?.());

describe("BuyBoxVersion table", () => {
  it("refuses to change or delete a saved version", async () => {
    await expect(
      db.query(`UPDATE "BuyBoxVersion" SET snapshot = '{"priceMax": 1}' WHERE id = 'version-1'`),
    ).rejects.toThrow("append-only");
    await expect(db.query(`DELETE FROM "BuyBoxVersion" WHERE id = 'version-1'`)).rejects.toThrow(
      "append-only",
    );
  });
});

describe("ImportRowResult table", () => {
  const insertRow = (
    row: number,
    outcome: string,
    reason: string | null,
    investorId: string | null,
  ) =>
    db.query(
      `INSERT INTO "ImportRowResult" (id, "batchId", "rowNumber", outcome, reason, "investorId")
       VALUES ($1, 'batch-1', $2, $3, $4, $5)`,
      [`row-${row}`, row, outcome, reason, investorId],
    );

  it("refuses a rejected row without its reason, and an imported row without its investor", async () => {
    await expect(insertRow(2, "REJECTED", null, null)).rejects.toThrow(
      "ImportRowResult_outcome_check",
    );
    await expect(insertRow(3, "IMPORTED", null, null)).rejects.toThrow(
      "ImportRowResult_outcome_check",
    );
    await expect(insertRow(4, "REJECTED", "row 4: Email is required", null)).resolves.toBeDefined();
    await expect(insertRow(5, "UPDATED", null, "investor-1")).resolves.toBeDefined();
  });
});
