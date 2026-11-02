// Guards the legacy import against a real Postgres (T322; FR-061, contracts/investor-import.md):
// the sample file imports 26 investors, each with one default box and its first version, and
// rejects 4 rows; importing it again updates the 26 and adds no investor, box, or version; a row
// the database refuses is rejected and leaves nothing behind; a retried job skips the rows it
// already recorded; a second run of the same batch at the same time aborts neither (T378); a stored
// file that is not a CSV is refused before a batch is queued (T384); and only operations can import.
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
const storage = new FakeStorageProvider();

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  const uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  upload(KEY, sample);
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

function upload(key: string, file: Buffer) {
  storage.objects.set(key, { contentType: "text/csv", sizeBytes: file.byteLength });
  storage.files.set(key, file);
}

const HEADER =
  "Investor ID,Company,Contact Name,Email,Type,Markets,Property Types,Min Price,Max Price";
/** A small file of its own, uploaded under its own key. */
function uploadRows(key: string, ...rows: string[]) {
  upload(key, Buffer.from([HEADER, ...rows].join("\n")));
  return key;
}

const start = (storageKey: string) =>
  imports.start(morgan, { storageKey, fileName: "investors.csv" });

async function importFile(storageKey = KEY) {
  const { batchId } = await start(storageKey);
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
    const first = await importFile();
    expect(first.batch).toMatchObject({
      totalRows: 30,
      imported: 26,
      updated: 0,
      rejected: 4,
      ignoredColumns: ["Source"],
      error: null,
    });
    expect(await counts()).toEqual({ investors: 26, boxes: 26, defaults: 26, versions: 26 });

    const second = await importFile();
    expect(second.batch).toMatchObject({ imported: 0, updated: 26, rejected: 4 });
    expect(await counts()).toEqual({ investors: 26, boxes: 26, defaults: 26, versions: 26 });
  });

  it("rejects a row the database refuses and leaves that investor as it was", async () => {
    // Arroyo (LEG-1001) given Bungalow Row's email: the update breaks the unique email.
    const key = uploadRows(
      "imports/clash.csv",
      "LEG-1001,Arroyo Home Buyers,Ar,bungalow@example.com,iBuyer,ALL,SFR,1,2",
    );
    const before = await counts();

    const { batch, rows } = await importFile(key);

    expect(batch).toMatchObject({ imported: 0, updated: 0, rejected: 1 });
    expect(rows).toEqual([
      expect.objectContaining({ outcome: "REJECTED", reason: expect.stringMatching(/^row 2: /) }),
    ]);
    const arroyo = await db.query(`SELECT email FROM "Investor" WHERE "externalRef" = 'LEG-1001'`);
    expect(arroyo.rows).toEqual([{ email: "arroyo@example.com" }]);
    expect(await counts()).toEqual(before);
  });

  it("skips the rows a retried job already recorded", async () => {
    const key = uploadRows(
      "imports/retry.csv",
      "LEG-9001,First Buyers,Fi,first@example.com,Wholesaler,TX,SFR,1,2",
      "LEG-9002,Second Buyers,Se,second@example.com,Wholesaler,TX,SFR,1,2",
    );
    const { batchId } = await start(key);
    // The first run stopped after row 2.
    await db.query(
      `INSERT INTO "ImportRowResult" (id, "batchId", "rowNumber", outcome, reason)
       VALUES ('done-2', $1, 2, 'REJECTED', 'row 2: recorded before the retry')`,
      [batchId],
    );

    await imports.run({ batchId });

    const { batch } = await imports.getBatch(morgan, batchId);
    expect(batch).toMatchObject({ imported: 1, rejected: 1 });
    const emails = await db.query(
      `SELECT email FROM "Investor" WHERE email IN ('first@example.com', 'second@example.com')`,
    );
    expect(emails.rows).toEqual([{ email: "second@example.com" }]);
  });

  it("lets a second run of the same batch at the same time finish without aborting either", async () => {
    const key = uploadRows(
      "imports/twice.csv",
      "LEG-9101,North Buyers,No,north@example.com,Wholesaler,TX,SFR,1,2",
      "LEG-9102,South Buyers,So,south@example.com,Wholesaler,TX,SFR,1,2",
      "LEG-9103,West Buyers,We,west@example.com,Wholesaler,TX,SFR,1,2",
    );
    const { batchId } = await start(key);

    await Promise.all([imports.run({ batchId }), imports.run({ batchId })]);

    const { batch } = await imports.getBatch(morgan, batchId);
    expect(batch).toMatchObject({ imported: 3, updated: 0, rejected: 0 });
    const investors = await db.query(
      `SELECT count(*)::int AS n FROM "Investor" WHERE "externalRef" LIKE 'LEG-91%'`,
    );
    expect(investors.rows[0].n).toBe(3);
  });

  it("refuses to start on a stored file that is not a CSV (T384)", async () => {
    storage.objects.set("imports/garbled.csv", {
      contentType: "application/json; charset=utf-8",
      sizeBytes: 16,
    });
    await expect(start("imports/garbled.csv")).rejects.toMatchObject({
      details: { fields: [{ field: "storageKey" }] },
    });
  });

  it("lets only operations import", async () => {
    const investor: Actor = { userId: "user-r", role: "INVESTOR", investorId: "investor-r" };
    await expect(
      imports.start(investor, { storageKey: KEY, fileName: "investors.csv" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
