// Checks the AuditLog rules against a real Postgres (T282, constitution XII): an entry can be
// added but never changed or deleted, it records the trace ID of the request that wrote it, and a
// personal detail in its details is redacted before it is stored for good. The newest entry of an
// action is found by values in its details (T396).
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { runWithTrace } from "../src/infra/trace-context.js";
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

describe("AuditLog table", () => {
  it("stores the request's trace ID, no personal detail, and never lets an entry be changed or deleted", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    await runWithTrace(traceId, () =>
      uow.run((repos) =>
        repos.audit.append({
          actorType: "USER",
          actorId: "user-a",
          action: "PACKAGE_CREATED",
          entityType: "ListingPackage",
          entityId: "package-1",
          outcome: "SUCCESS",
          details: { offerId: "offer-1", seller: { email: "maria@example.com" } },
        }),
      ),
    );
    const { rows } = await db.query(`SELECT id, "correlationId", details FROM "AuditLog"`);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        correlationId: traceId,
        details: { offerId: "offer-1", seller: { email: "[REDACTED]" } },
      },
    ]);

    await expect(
      db.query(`UPDATE "AuditLog" SET outcome = 'SUCCESS' WHERE id = $1`, [rows[0].id]),
    ).rejects.toThrow(/append-only/);
    await expect(db.query(`DELETE FROM "AuditLog" WHERE id = $1`, [rows[0].id])).rejects.toThrow(
      /append-only/,
    );
  });

  it("finds an entity's newest entry of one action by values in its details (T396)", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    for (const [round, evaluated] of [
      [1, 5],
      [1, 7],
      [2, 9],
    ]) {
      await uow.run((repos) =>
        repos.audit.append({
          actorType: "SYSTEM",
          actorId: null,
          action: "MATCHING_COMPLETED",
          entityType: "ListingPackage",
          entityId: "package-latest",
          outcome: "SUCCESS",
          details: { round, evaluated },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const latest = await uow.run((repos) =>
      repos.audit.findLatest("ListingPackage", "package-latest", "MATCHING_COMPLETED", {
        round: 1,
      }),
    );
    expect(latest?.details).toEqual({ round: 1, evaluated: 7 });
  });
});
