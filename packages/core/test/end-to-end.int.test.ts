// Walks the whole loop on a real Postgres through the real services and workflows (T360; R18,
// SC-010): publish, match, offer, accept, every milestone to CLOSED, and the CRM told at each step.
// The sandbox runs as its own process (its real server, started with tsx) on the database's
// `sandbox` schema. The relay queues to a list and the test hands each delivery to the dispatcher,
// as the worker's BullMQ consumer would, so the run needs no Redis and has no timing to wait on.
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Actor } from "@clever/contracts/auth";
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import type { DealMilestone } from "@clever/contracts/deal";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobHandlers } from "../src/jobs/handlers.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DeliveryDispatcher } from "../src/outbox/DeliveryDispatcher.js";
import { OutboxRelay } from "../src/outbox/OutboxRelay.js";
import { SandboxCrmProviderImpl } from "../src/providers/crm/SandboxCrmProviderImpl.js";
import { StaticGeoProviderImpl } from "../src/providers/geo/StaticGeoProviderImpl.js";
import { SandboxMessagingProviderImpl } from "../src/providers/messaging/SandboxMessagingProviderImpl.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../src/providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "../src/services/listing-package/ListingPackageService.js";
import { OfferService } from "../src/services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../src/workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { DecisionWorkflow } from "../src/workflows/decision/DecisionWorkflow.js";
import { MatchingWorkflow } from "../src/workflows/matching/MatchingWorkflow.js";
import { OfferRoundWorkflow } from "../src/workflows/offer-round/OfferRoundWorkflow.js";
import { PublicationWorkflow } from "../src/workflows/publication/PublicationWorkflow.js";
import { startMigratedDatabase } from "./database.js";

const SANDBOX_DIR = fileURLToPath(new URL("../../../apps/sandbox/", import.meta.url));
const TOKEN = "end-to-end-internal-token";
const RETRY: DeliveryRetryPolicy = { baseMs: 20, factor: 2, capMs: 100, jitter: 0, attempts: 2 };
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const summit: Actor = { userId: "user-summit", role: "INVESTOR", investorId: "summit" };
const seller = {
  fullName: "Ottoline Quillfeather",
  email: "ottoline.quillfeather@example.test",
  phone: "+15125550187",
};
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const day = (days: number) => inDays(days).toISOString().slice(0, 10);

let db: pg.Client;
let stopDb: () => Promise<void>;
let prisma: PrismaClient;
let sandbox: ChildProcess;
let sandboxUrl: string;

/** A port free right now, for the sandbox to listen on. */
async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** Starts the sandbox's own server on the test database and waits until it listens. */
async function startSandbox(databaseUrl: string): Promise<void> {
  const port = await freePort();
  sandboxUrl = `http://127.0.0.1:${port}`;
  sandbox = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: SANDBOX_DIR,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SANDBOX_STORAGE_DIR: mkdtempSync(join(tmpdir(), "end-to-end-")),
      STORAGE_SIGNING_KEY: "end-to-end-signing-key",
      SANDBOX_INTERNAL_TOKEN: TOKEN,
      WEB_ORIGIN: "http://localhost:3000",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    sandbox.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("sandbox listening")) resolve();
    });
    sandbox.once("exit", (code) => reject(new Error(`The sandbox stopped with code ${code}`)));
  });
}

beforeAll(async () => {
  let url: string;
  ({ db, url, stop: stopDb } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  await startSandbox(url);
  await db.query(`
    INSERT INTO "ConfigEntry" (key, value, "updatedAt")
      VALUES ('netProceeds', '{"closingCostPct": 0.02, "flatFees": 1500}', now());
    INSERT INTO "Brand" (id, name, tokens, content, hosts, "updatedAt")
      VALUES ('test', 'Test Homes', '{}', '{}', '{localhost}', now());
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, phone, "investorType", "proofOfFundsExpiresAt", "updatedAt")
      VALUES ('summit', 'Summit', 'Sam', 'summit@example.test', '+15125550100', 'DIRECT_BUYER', now() + interval '1 year', now());
    INSERT INTO "BuyBox" (id, "investorId", name, "geographyMode", "propertyTypes", "priceMin", "priceMax", "updatedAt")
      VALUES ('summit-box', 'summit', 'Austin flips', 'ZIPS', '{SINGLE_FAMILY}', 250000, 300000, now());
    INSERT INTO "BuyBoxGeography" (id, "buyBoxId", kind, value) VALUES ('g1', 'summit-box', 'ZIP', '78704');
  `);
});

afterAll(async () => {
  sandbox?.kill();
  await prisma?.$disconnect();
  await stopDb?.();
});

describe("the whole loop", () => {
  it("publishes, matches, takes an offer, closes the deal, and tells the CRM each step", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const clock = { now: () => new Date() };
    const geo = new StaticGeoProviderImpl();
    const packages = new ListingPackageService(uow, {
      geo,
      addressHash: createAddressHasher("test-hash-key"),
      clock,
    });
    const deals = new DealLifecycleWorkflow(uow, { clock });
    const handlers = createJobHandlers({
      matching: new MatchingWorkflow(uow, { clock }),
      offerRound: new OfferRoundWorkflow(uow),
      deals,
      imports: { run: () => Promise.reject(new Error("No imports in this test")) },
      digests: { send: () => Promise.reject(new Error("No digests in this test")) },
    });
    const queued: string[] = [];
    const relay = new OutboxRelay(uow, {
      queue: { enqueue: async (ids) => void queued.push(...ids) },
      clock,
    });
    const target = { internalUrl: sandboxUrl, internalToken: TOKEN };
    const dispatcher = new DeliveryDispatcher(uow, {
      crm: new SandboxCrmProviderImpl(target),
      messaging: new SandboxMessagingProviderImpl(target),
      clock,
      retry: RETRY,
      brandId: "test",
    });
    /** Runs the due jobs, then relays and sends every delivery, as the worker's loops would. */
    const work = async () => {
      for (;;) {
        const job = await uow.run((repos) => repos.jobs.claimNext("worker", clock.now()));
        if (!job) break;
        await handlers[job.type](job.payload);
        await uow.run((repos) => repos.jobs.complete(job.id));
      }
      await relay.tick();
      for (let id = queued.shift(); id; id = queued.shift()) await dispatcher.dispatch(id);
    };

    const { package: draft } = await packages.create(avery, {
      seller,
      property: {
        streetLine: "4471 Wrenfield Hollow Rd",
        zip: "78704",
        propertyType: "SINGLE_FAMILY",
        beds: 3,
        baths: 2,
        sqft: 1_600,
        yearBuilt: 1985,
        condition: "FAIR",
      },
      priceExpectationMin: 250_000,
      priceExpectationMax: 300_000,
      closingWindowStart: day(20),
      closingWindowEnd: day(45),
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER"],
    });
    const packageId = draft.id;
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
    await work();

    const offer = await new OfferService(uow, { clock }).create(summit, packageId, {
      price: 280_000,
      paymentType: "CASH",
      closingDate: day(30),
      earnestMoney: 5_000,
      contingencies: ["INSPECTION"],
      feesAndConcessions: 0,
      expiresAt: inDays(2).toISOString(),
    });
    await work();

    await new DecisionWorkflow(uow, { clock }).record(avery, packageId, {
      type: "ACCEPT",
      offerId: offer.id,
      version: offer.version,
    });
    await work();

    let parts = await deals.get(avery, packageId);
    const milestones: DealMilestone[] = ["UNDER_CONTRACT", "INSPECTION", "CLOSING", "CLOSED"];
    for (const milestone of milestones) {
      parts = await deals.recordMilestone(avery, parts.deal.id, {
        milestone,
        version: parts.deal.version,
      });
      await work();
    }

    expect(parts.deal.status).toBe("CLOSED");
    const pkg = await db.query(`SELECT status FROM "ListingPackage" WHERE id = $1`, [packageId]);
    expect(pkg.rows).toEqual([{ status: "CLOSED" }]);
    const deliveries = await db.query<{ target: string; status: string }>(
      `SELECT target, status FROM "Delivery"`,
    );
    expect(new Set(deliveries.rows.map((row) => row.target))).toEqual(
      new Set(["CRM", "EMAIL", "SMS"]),
    );
    expect(deliveries.rows.filter((row) => row.status !== "SENT")).toEqual([]);
    const crm = await fetch(`${sandboxUrl}/crm/listings`, {
      headers: { "x-sandbox-token": TOKEN },
    });
    const { listings } = (await crm.json()) as { listings: unknown[] };
    expect(listings).toEqual([
      expect.objectContaining({
        packageId,
        status: "CLOSED",
        offerCount: 1,
        acceptedPrice: 280_000,
        sellerContact: seller,
      }),
    ]);
  });
});
