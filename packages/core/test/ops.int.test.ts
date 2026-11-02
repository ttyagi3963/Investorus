// Guards the operations console's rules on a real Postgres (T341; FR-071, FR-073, FR-074, FR-080):
// only operations can use it; "why not matched" replays the buy box as it was when the package was
// matched, not as the investor edited it later, while a match returns the stored decision; the trace
// counts what was matched, sent, and set aside, and lists who was not matched; and only a delivery
// set aside can be retried, by one or by target, each retry audited; a backlog far past what the
// old row-by-row reset finished inside the 5 s transaction limit resets in one call (T386); the CRM
// comparison finds each package's unsent CRM delivery in one query (T399).
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import type { BuyBoxInput } from "@clever/contracts/buy-box";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobHandlers } from "../src/jobs/handlers.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { OutboxRelay } from "../src/outbox/OutboxRelay.js";
import { StaticGeoProviderImpl } from "../src/providers/geo/StaticGeoProviderImpl.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../src/providers/pii-cipher/address-hasher.js";
import { BuyBoxService } from "../src/services/buy-box/BuyBoxService.js";
import { ListingPackageService } from "../src/services/listing-package/ListingPackageService.js";
import { DeliveryOpsService } from "../src/services/ops/DeliveryOpsService.js";
import { OpsQueryService } from "../src/services/ops/OpsQueryService.js";
import { OutsideServicesService } from "../src/services/ops/OutsideServicesService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../src/workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { MatchingWorkflow } from "../src/workflows/matching/MatchingWorkflow.js";
import { OfferRoundWorkflow } from "../src/workflows/offer-round/OfferRoundWorkflow.js";
import { PublicationWorkflow } from "../src/workflows/publication/PublicationWorkflow.js";
import { listing } from "./fixtures/published-package.js";
import { startMigratedDatabase } from "./database.js";

const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const ops: Actor = { userId: "user-ops", role: "OPS", agentId: null };
const summit: Actor = { userId: "user-summit", role: "INVESTOR", investorId: "summit" };
const ridge: Actor = { userId: "user-ridge", role: "INVESTOR", investorId: "ridge" };

const box = (change: Partial<BuyBoxInput>): BuyBoxInput => ({
  name: "Box",
  strategy: null,
  status: "ACTIVE",
  geographyMode: "NATIONWIDE",
  geography: [],
  propertyTypes: null,
  priceMin: null,
  priceMax: null,
  yearBuiltMin: null,
  yearBuiltMax: null,
  bedsMin: null,
  bedsMax: null,
  bathsMin: null,
  bathsMax: null,
  sqftMin: null,
  sqftMax: null,
  unitsMin: null,
  unitsMax: null,
  conditionsAccepted: null,
  repairMax: null,
  closeWithinDays: null,
  acceptsListed: true,
  programsAccepted: null,
  ...change,
});

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
let uow: PrismaUnitOfWorkImpl;
let packageId: string;
const queries = () => new OpsQueryService(uow);
const deliveries = () => new DeliveryOpsService(uow);

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "proofOfFundsExpiresAt", "updatedAt") VALUES
      ('summit', 'Summit Home Buyers', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now() + interval '1 year', now()),
      ('ridge', 'Ridge Capital', 'Rae', 'ridge@example.test', 'DIRECT_BUYER', now() + interval '1 year', now());
  `);

  const clock = { now: () => new Date() };
  const geo = new StaticGeoProviderImpl();
  const boxes = new BuyBoxService(uow, { geo, clock: { now: () => new Date() } });
  await boxes.create(
    summit,
    box({ name: "Austin flips", geographyMode: "ZIPS", geography: ["78704"] }),
  );
  const narrow = await boxes.create(ridge, box({ name: "Cheap only", priceMax: 100_000 }));

  const handlers = createJobHandlers({
    matching: new MatchingWorkflow(uow, { clock }),
    offerRound: new OfferRoundWorkflow(uow),
    deals: new DealLifecycleWorkflow(uow, { clock }),
    imports: { run: () => Promise.reject(new Error("No imports in this test")) },
    digests: { send: () => Promise.reject(new Error("No digests in this test")) },
  });
  /** Runs every job that is due, as the worker would. */
  const drain = async () => {
    for (;;) {
      const job = await uow.run((repos) => repos.jobs.claimNext("worker", new Date()));
      if (!job) return;
      await handlers[job.type](job.payload);
      await uow.run((repos) => repos.jobs.complete(job.id, "worker"));
    }
  };
  await drain();

  const packages = new ListingPackageService(uow, {
    geo,
    addressHash: createAddressHasher("test-hash-key"),
    clock,
  });
  const { package: created } = await packages.create(avery, listing());
  packageId = created.id;
  await uow.run((repos) =>
    repos.photos.add({
      packageId,
      storageKey: "photos/0.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1_000,
      position: 0,
    }),
  );
  await new PublicationWorkflow(uow, { clock }).publish(avery, packageId, { version: 1 });
  await drain();

  // Ridge widens the box afterwards; its new version is not matched in this test.
  await boxes.update(ridge, narrow.id, {
    ...box({ name: "Cheap only", priceMax: 400_000 }),
    version: 1,
  });
  await new OutboxRelay(uow, { queue: { enqueue: async () => {} }, clock }).tick();
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("operations console", () => {
  it("is for operations only", async () => {
    await expect(queries().listPackages(summit)).rejects.toMatchObject({ status: 403 });
    await expect(deliveries().retryAll(summit, {})).rejects.toMatchObject({ status: 403 });
  });

  it("replays a non-match against the box as it was, and returns a match's stored decision", async () => {
    const notMatched = await queries().explainMatch(ops, packageId, "ridge");
    const matched = await queries().explainMatch(ops, packageId, "summit");

    expect(notMatched).toMatchObject({ source: "REPLAYED", matched: false });
    expect(notMatched.buyBoxes).toEqual([
      expect.objectContaining({ name: "Cheap only", version: 1, matched: false }),
    ]);
    expect(notMatched.buyBoxes[0]?.criteria).toContainEqual(
      expect.objectContaining({ key: "price", passed: false }),
    );
    expect(matched).toMatchObject({ source: "STORED", matched: true });
  });

  it("explains a CRM difference by the package's CRM delivery not yet sent", async () => {
    const crm = await db.query<{ id: string }>(`SELECT id FROM "Delivery" WHERE target = 'CRM'`);
    const outside = new OutsideServicesService(uow, {
      crm: { listListings: async () => [] },
      simulation: {
        get: () => Promise.reject(new Error("unused")),
        set: () => Promise.reject(new Error("unused")),
      },
    });

    expect(await outside.crmComparison(ops)).toEqual([
      expect.objectContaining({
        packageId,
        crmStatus: null,
        inSync: false,
        pendingDelivery: { id: crm.rows[0]!.id, status: "PENDING" },
      }),
    ]);
  });

  it("traces who matched, what was sent or set aside, and who was not matched", async () => {
    await db.query(
      `UPDATE "Delivery" SET status = 'NEEDS_ATTENTION', attempts = 10, "lastError" = 'The sandbox answered 503'
       WHERE target = 'EMAIL'`,
    );

    const trace = await queries().trace(ops, packageId);

    expect(trace.stats).toMatchObject({ matched: 1, needsAttention: 1 });
    expect(trace.matched).toEqual([
      expect.objectContaining({
        companyName: "Summit Home Buyers",
        notification: { status: "NEEDS_ATTENTION", lastError: "The sandbox answered 503" },
      }),
    ]);
    expect(trace.excluded).toEqual([{ investorId: "ridge", companyName: "Ridge Capital" }]);
  });

  it("retries only deliveries set aside, by target, and audits each retry", async () => {
    await db.query(`UPDATE "Delivery" SET status = 'NEEDS_ATTENTION', attempts = 10`);
    const crm = await db.query<{ id: string }>(`SELECT id FROM "Delivery" WHERE target = 'CRM'`);

    const byTarget = await deliveries().retryAll(ops, { target: "EMAIL" });
    await deliveries().retry(ops, crm.rows[0]!.id);
    await expect(deliveries().retry(ops, crm.rows[0]!.id)).rejects.toMatchObject({ status: 409 });

    expect(byTarget.count).toBe(1);
    const states = await db.query(
      `SELECT target, status, attempts FROM "Delivery" ORDER BY target`,
    );
    expect(states.rows).toEqual([
      { target: "CRM", status: "PENDING", attempts: 0 },
      { target: "EMAIL", status: "PENDING", attempts: 0 },
    ]);
    const audit = await db.query(
      `SELECT count(*)::int AS n FROM "AuditLog" WHERE action = 'DELIVERY_RETRIED'`,
    );
    expect(audit.rows[0]).toEqual({ n: 2 });
  });

  it("retries a large backlog set aside in one call, only the package asked for, audited once", async () => {
    const backlog = 20_000;
    await db.query(`
      INSERT INTO "OutboxEvent" (id, type, "aggregateType", "aggregateId", payload)
        VALUES ('backlog', 'offer.submitted', 'ListingPackage', 'another-package', '{}');
      INSERT INTO "Delivery" (id, "outboxEventId", target, "recipientRef", status, attempts, "queuedAt", "updatedAt")
        SELECT 'backlog-' || n, 'backlog', 'EMAIL', 'investor-' || n, 'NEEDS_ATTENTION', 10, now(), now()
        FROM generate_series(1, ${backlog}) AS n;
    `);

    expect(await deliveries().retryAll(ops, { packageId })).toEqual({ count: 0 });
    expect(await deliveries().retryAll(ops, {})).toEqual({ count: backlog });

    const states = await db.query(
      `SELECT status, attempts, "queuedAt", "nextAttemptAt", count(*)::int AS n
       FROM "Delivery" WHERE "outboxEventId" = 'backlog' GROUP BY 1, 2, 3, 4`,
    );
    expect(states.rows).toEqual([
      { status: "PENDING", attempts: 0, queuedAt: null, nextAttemptAt: null, n: backlog },
    ]);
    const audit = await db.query(
      `SELECT count(*)::int AS n FROM "AuditLog"
       WHERE action = 'DELIVERY_RETRIED' AND (details->>'deliveries')::int = $1`,
      [backlog],
    );
    expect(audit.rows[0]).toEqual({ n: 1 });
  });
});
