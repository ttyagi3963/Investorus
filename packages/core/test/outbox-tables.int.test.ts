// Checks the outbox table rules against a real Postgres (T336; constitution XVIII): an event is
// history that only the relay may mark relayed, once; one event makes at most one delivery per
// target and recipient, so a second relay pass cannot send twice; and a sent delivery says when.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(`
    INSERT INTO "OutboxEvent" (id, type, "aggregateType", "aggregateId", payload)
      VALUES ('event-1', 'package.status_changed', 'ListingPackage', 'package-1', '{}'),
             ('event-2', 'package.status_changed', 'ListingPackage', 'package-1', '{}');
  `);
});

afterAll(() => stop?.());

const insertDelivery = (id: string, status = "PENDING", sentAt: string | null = null) =>
  db.query(
    `INSERT INTO "Delivery" (id, "outboxEventId", target, "recipientRef", status, "sentAt", "updatedAt")
     VALUES ($1, 'event-1', 'CRM', 'package-1', $2, $3, now())`,
    [id, status, sentAt],
  );

describe("OutboxEvent table", () => {
  it("lets the relay set relayedAt once and refuses every other change", async () => {
    await db.query(`UPDATE "OutboxEvent" SET "relayedAt" = now() WHERE id = 'event-1'`);

    await expect(
      db.query(`UPDATE "OutboxEvent" SET "relayedAt" = now() WHERE id = 'event-1'`),
    ).rejects.toThrow("append-only");
    await expect(
      db.query(`UPDATE "OutboxEvent" SET payload = '{"to": "CLOSED"}' WHERE id = 'event-2'`),
    ).rejects.toThrow("append-only");
    await expect(db.query(`DELETE FROM "OutboxEvent" WHERE id = 'event-2'`)).rejects.toThrow(
      "append-only",
    );
  });
});

describe("Delivery table", () => {
  it("allows one delivery per event, target, and recipient", async () => {
    await insertDelivery("delivery-1");
    await expect(insertDelivery("delivery-2")).rejects.toThrow(
      "Delivery_outboxEventId_target_recipientRef_key",
    );
  });

  it("refuses a sent delivery without its sent time", async () => {
    await db.query(`DELETE FROM "Delivery"`);
    await expect(insertDelivery("delivery-3", "SENT", null)).rejects.toThrow("Delivery_sent_check");
  });
});
