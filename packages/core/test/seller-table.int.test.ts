// Checks the Seller table's contact rule against a real Postgres: a seller must have an email or a
// phone. The hand-written CHECK works on encrypted values, because a field left empty stays NULL.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
});

afterAll(() => stop?.());

const insertSeller = (id: string, email: string | null, phone: string | null) =>
  db.query(
    `INSERT INTO "Seller" (id, "fullName", email, phone, "updatedAt")
     VALUES ($1, 'v1:encrypted-name', $2, $3, now())`,
    [id, email, phone],
  );

describe("Seller table", () => {
  it("requires an email or a phone", async () => {
    await expect(insertSeller("seller-email", "v1:encrypted-email", null)).resolves.toBeDefined();
    await expect(insertSeller("seller-phone", null, "v1:encrypted-phone")).resolves.toBeDefined();
    await expect(insertSeller("seller-none", null, null)).rejects.toThrow(/Seller_contact_check/);
  });
});
