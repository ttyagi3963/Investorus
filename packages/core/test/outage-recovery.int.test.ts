// Guards delivery through an outage, end to end on a real Postgres and Redis (T339; FR-070, FR-071,
// FR-077, SC-007, SC-012): an event written in a change that rolls back sends nothing; while the
// outside services are down the change still succeeds and its deliveries retry, then are set aside;
// after an operator's retry every delivery arrives exactly once, and the CRM gets the seller's
// contact. The outside services are a small HTTP server here; the sandbox's own rules are tested in
// apps/sandbox.
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Actor } from "@clever/contracts/auth";
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DeliveryDispatcher } from "../src/outbox/DeliveryDispatcher.js";
import { OutboxRelay } from "../src/outbox/OutboxRelay.js";
import { writeEvent } from "../src/outbox/write-event.js";
import { SandboxCrmProviderImpl } from "../src/providers/crm/SandboxCrmProviderImpl.js";
import { BullMqDeliveryQueueImpl } from "../src/providers/delivery-queue/BullMqDeliveryQueueImpl.js";
import { StaticGeoProviderImpl } from "../src/providers/geo/StaticGeoProviderImpl.js";
import { SandboxMessagingProviderImpl } from "../src/providers/messaging/SandboxMessagingProviderImpl.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../src/providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "../src/services/listing-package/ListingPackageService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { listing } from "./fixtures/published-package.js";
import { startMigratedDatabase } from "./database.js";

const RETRY: DeliveryRetryPolicy = { baseMs: 20, factor: 2, capMs: 100, jitter: 0, attempts: 3 };
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

/** The stand-in outside world: answers 503 while down, and applies each Idempotency-Key once. */
const outside = { down: false, applied: new Map<string, { path: string; body: unknown }>() };

let db: pg.Client;
let stopDb: () => Promise<void>;
let prisma: PrismaClient;
let redis: StartedRedisContainer;
let server: Server;
let uow: PrismaUnitOfWorkImpl;
let relay: OutboxRelay;
let queue: BullMqDeliveryQueueImpl;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop: stopDb } = await startMigratedDatabase());
  redis = await new RedisContainer("redis:7-alpine").start();
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );

  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      if (outside.down) return void res.writeHead(503).end();
      const key = String(req.headers["idempotency-key"]);
      if (!outside.applied.has(key)) {
        outside.applied.set(key, { path: req.url ?? "", body: JSON.parse(raw) as unknown });
      }
      const crm = req.url?.startsWith("/crm/");
      res.writeHead(crm ? 200 : 201, { "Content-Type": "application/json" });
      res.end(JSON.stringify(crm ? { result: "APPLIED" } : { id: key }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const target = {
    internalUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    internalToken: "test-token",
  };

  const clock = { now: () => new Date() };
  queue = new BullMqDeliveryQueueImpl({ redisUrl: redis.getConnectionUrl(), retry: RETRY });
  relay = new OutboxRelay(uow, { queue, clock });
  const dispatcher = new DeliveryDispatcher(uow, {
    crm: new SandboxCrmProviderImpl(target),
    messaging: new SandboxMessagingProviderImpl(target),
    clock,
    retry: RETRY,
    brandId: "test",
  });
  queue.startConsumer((id) => dispatcher.dispatch(id), { concurrency: 3, onSetAside: () => {} });

  await db.query(`
    INSERT INTO "Brand" (id, name, tokens, content, hosts, "updatedAt")
      VALUES ('test', 'Test Homes', '{}', '{}', '{localhost}', now());
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, phone, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', '+15125550100', 'DIRECT_BUYER', now());
  `);
});

afterAll(async () => {
  await queue?.close();
  server?.close();
  await prisma?.$disconnect();
  await redis?.stop();
  await stopDb?.();
});

/** Runs the relay until every delivery has the status, or fails after a few seconds. */
async function relayUntil(status: string) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    await relay.tick();
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM "Delivery"`);
    if (rows.length > 0 && rows.every((row) => row.status === status)) return;
    if (Date.now() > deadline) throw new Error(`Deliveries never all became ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("delivery through an outage", () => {
  it("writes nothing when the change that wrote the event rolls back", async () => {
    await expect(
      uow.run(async (repos) => {
        await writeEvent(repos, {
          type: "investor.notice",
          payload: {
            packageId: "package-x",
            investorId: "investor-1",
            noticeType: "OFFER_ACCEPTED",
            title: "Your offer was accepted",
            body: "Your offer on the listing in Austin, TX 78704 was accepted.",
            channels: ["EMAIL"],
          },
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");

    const { rows } = await db.query(`SELECT id FROM "OutboxEvent"`);
    expect(rows).toEqual([]);
  });

  it("retries while the services are down, sets the deliveries aside, and sends each once after a retry", async () => {
    const packages = new ListingPackageService(uow, {
      geo: new StaticGeoProviderImpl(),
      addressHash: createAddressHasher("test-hash-key"),
      clock: { now: () => new Date() },
    });
    const { package: pkg } = await packages.create(avery, listing());
    outside.down = true;
    await uow.run(async (repos) => {
      await writeEvent(repos, {
        type: "package.status_changed",
        payload: {
          packageId: pkg.id,
          from: "DRAFT",
          crm: { status: "ACCEPTING_OFFERS", round: 1, offerCount: 0, acceptedPrice: null },
        },
      });
      await writeEvent(repos, {
        type: "investor.notice",
        payload: {
          packageId: pkg.id,
          investorId: "investor-1",
          noticeType: "PACKAGE_MATCHED",
          title: "A new listing matches your buy box",
          body: "A listing in Austin, TX 78704 matches Flips.",
          channels: ["EMAIL", "SMS"],
        },
      });
    });

    await relayUntil("NEEDS_ATTENTION");
    const setAside = await db.query<{ id: string; attempts: number }>(
      `SELECT id, attempts FROM "Delivery"`,
    );
    expect(setAside.rows.map((row) => row.attempts)).toEqual([3, 3, 3]);
    expect(outside.applied.size).toBe(0);

    outside.down = false;
    await uow.run(async (repos) => {
      for (const { id } of setAside.rows) await repos.deliveries.resetForRetry(id);
    });
    await relayUntil("SENT");

    expect([...outside.applied.keys()].sort()).toEqual(setAside.rows.map((row) => row.id).sort());
    expect([...outside.applied.values()].map((sent) => sent.path).sort()).toEqual([
      `/crm/listings/${pkg.id}`,
      "/messages/email",
      "/messages/sms",
    ]);
    const crm = [...outside.applied.values()].find((sent) => sent.path.startsWith("/crm/"));
    expect(crm?.body).toMatchObject({
      status: "ACCEPTING_OFFERS",
      sellerContact: { fullName: "Maria Lopez", phone: "+15551234567" },
    });
  });
});
