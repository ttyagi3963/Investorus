// Guards the legacy import against a real Postgres (T322; FR-061, contracts/investor-import.md):
// the sample file imports 26 investors, each with one default box and its first version, and
// rejects 4 rows with their reasons; importing it again updates the 26 and adds no investor, box,
// or version; and only operations can import.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Actor } from "@clever/contracts/auth";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { StaticGeoProviderImpl } from "../src/providers/geo/StaticGeoProviderImpl.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { InvestorImportWorkflow } from "../src/workflows/investor-import/InvestorImportWorkflow.js";
import { FakeStorageProvider } from "./doubles/FakeStorageProvider.js";
import { startMigratedDatabase } from "./database.js";

const morgan: Actor = { userId: "user-ops", role: "OPS", agentId: null };
const sample = readFileSync(new URL("../../../seed/legacy-investors.csv", import.meta.url));
const KEY = "imports/sample.csv";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let imports: InvestorImportWorkflow;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  const uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  const storage = new FakeStorageProvider();
  storage.objects.set(KEY, { contentType: "text/csv", sizeBytes: sample.byteLength });
  storage.files.set(KEY, sample);
  imports = new InvestorImportWorkflow(uow, {
    storage,
    geo: new StaticGeoProviderImpl(),
    clock: { now: () => new Date("2026-11-01T12:00:00Z") },
  });
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

async function importSample() {
  const { batchId } = await imports.start(morgan, { storageKey: KEY, fileName: "investors.csv" });
  await imports.run({ batchId });
  return imports.getBatch(morgan, batchId);
}

async function counts() {
  const { rows } = await db.query(`
    SELECT (SELECT count(*)::int FROM "Investor") AS investors,
           (SELECT count(*)::int FROM "BuyBox") AS boxes,
           (SELECT count(*)::int FROM "BuyBox" WHERE "isDefault" AND name = 'Legacy Import') AS defaults,
           (SELECT count(*)::int FROM "BuyBoxVersion") AS versions`);
  return rows[0];
}

describe("InvestorImportWorkflow", () => {
  it("imports the sample file once, and a second import updates it without duplicates", async () => {
    const first = await importSample();
    expect(first.batch).toMatchObject({
      totalRows: 30,
      imported: 26,
      updated: 0,
      rejected: 4,
      ignoredColumns: ["Source"],
      error: null,
    });
    expect(first.rows.flatMap((row) => (row.reason ? [row.reason] : []))).toEqual([
      "row 7: Max Price (-5): Must be 0 or more",
      "row 12: Markets: ZIP 00000 is not a valid ZIP code",
      "row 19: Email is required",
      "row 24: Min Price (400000): Min price must not be above max price",
    ]);
    expect(await counts()).toEqual({ investors: 26, boxes: 26, defaults: 26, versions: 26 });

    const second = await importSample();
    expect(second.batch).toMatchObject({ imported: 0, updated: 26, rejected: 4 });
    expect(await counts()).toEqual({ investors: 26, boxes: 26, defaults: 26, versions: 26 });
  });

  it("lets only operations import", async () => {
    const investor: Actor = { userId: "user-r", role: "INVESTOR", investorId: "investor-r" };
    await expect(
      imports.start(investor, { storageKey: KEY, fileName: "investors.csv" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
