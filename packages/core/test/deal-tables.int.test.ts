// Checks the Deal and Decision rules against a real Postgres (T304): one active deal per package
// (FR-053), so two accepts can never both win; a fallen-through deal keeps its reason (FR-056) and
// a promoted backup its deadline to reconfirm (FR-057); and decisions name a real offer and can
// never be changed.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;
let n = 0;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-1', 'Avery Agent', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit Capital', 'Sam Summit', 'summit@example.test', 'DIRECT_BUYER', now());
    INSERT INTO "Seller" (id, "fullName", email, "updatedAt") VALUES ('seller-1', 'v1:x', 'v1:y', now());
    INSERT INTO "Property" (id, "streetLine", "addressHash", zip, city, state, "propertyType", "updatedAt")
      VALUES ('property-1', 'v1:z', 'hash-1', '78704', 'Austin', 'TX', 'SINGLE_FAMILY', now());
    INSERT INTO "ListingPackage" (id, "agentId", "sellerId", "propertyId", "addressHash", "priceExpectationMin", "priceExpectationMax", status, "updatedAt")
      VALUES ('package-1', 'agent-1', 'seller-1', 'property-1', 'hash-1', 250000, 300000, 'OFFER_ACCEPTED', now());
  `);
});

afterAll(() => stop?.());

/** An offer of its own for each deal, since a deal's offer is unique. */
async function insertDeal(
  status: string,
  {
    fellThroughReason = null,
    reconfirmBy = null,
  }: { fellThroughReason?: string | null; reconfirmBy?: Date | null } = {},
) {
  const offerId = `offer-${++n}`;
  await db.query(
    `INSERT INTO "Offer" (id, "packageId", "investorId", round, status, price, "paymentType", "closingDate", "earnestMoney", contingencies, "feesAndConcessions", "expiresAt", "updatedAt")
     VALUES ($1, 'package-1', 'investor-1', 1, 'DECLINED', 280000, 'CASH', '2026-12-15', 5000, '{}', 0, now(), now())`,
    [offerId],
  );
  const { rows } = await db.query(
    `INSERT INTO "Deal" (id, "packageId", "offerId", status, "fellThroughReason", "reconfirmBy", "updatedAt")
     VALUES ($1, 'package-1', $2, $3, $4, $5, now()) RETURNING id`,
    [`deal-${n}`, offerId, status, fellThroughReason, reconfirmBy],
  );
  return rows[0].id as string;
}

describe("Deal table", () => {
  it("allows one active deal per package, and another once it falls through", async () => {
    const first = await insertDeal("OFFER_ACCEPTED");
    await expect(insertDeal("OFFER_ACCEPTED")).rejects.toThrow("Deal_one_active_per_package");
    await db.query(
      `UPDATE "Deal" SET status = 'FELL_THROUGH', "fellThroughReason" = 'Financing' WHERE id = $1`,
      [first],
    );
    await expect(insertDeal("OFFER_ACCEPTED")).resolves.toBeDefined();
  });

  it("refuses a fallen-through deal without its reason", async () => {
    await expect(insertDeal("FELL_THROUGH")).rejects.toThrow("Deal_fellThroughReason_check");
  });

  it("refuses a promoted backup without its deadline to reconfirm", async () => {
    await db.query(`UPDATE "Deal" SET status = 'CLOSED'`);
    await expect(insertDeal("PENDING_RECONFIRMATION")).rejects.toThrow("Deal_reconfirmBy_check");
    await expect(
      insertDeal("PENDING_RECONFIRMATION", { reconfirmBy: new Date() }),
    ).resolves.toBeDefined();
  });
});

describe("Decision table", () => {
  const insertDecision = (type: string, offerId: string | null) =>
    db.query(
      `INSERT INTO "Decision" (id, "packageId", round, type, "offerId", "actorUserId")
       VALUES ($1, 'package-1', 1, $2, $3, 'user-1') RETURNING id`,
      [`decision-${++n}`, type, offerId],
    );

  it("refuses an accept that names no offer, or an offer that does not exist", async () => {
    await expect(insertDecision("ACCEPT", null)).rejects.toThrow("Decision_offer_check");
    await expect(insertDecision("ACCEPT", "no-such-offer")).rejects.toThrow(
      "Decision_offerId_fkey",
    );
  });

  it("can be added but never changed or removed", async () => {
    const { rows } = await insertDecision("DECLINE_ALL", null);
    await expect(
      db.query(`UPDATE "Decision" SET note = 'changed' WHERE id = $1`, [rows[0].id]),
    ).rejects.toThrow("append-only");
    await expect(db.query(`DELETE FROM "Decision" WHERE id = $1`, [rows[0].id])).rejects.toThrow(
      "append-only",
    );
  });
});
