// Checks that a delivery goes out once and never vanishes, on a real Postgres and Redis (T379;
// FR-070, FR-071, constitution XVIII): a run that lost its claim on a delivery (the stale sweep gave
// it to a newer run) cannot record its outcome over the newer run's, and a delivery whose
// dispatch keeps throwing ends set aside for operations, not silently dropped from the queue.
import { randomBytes } from "node:crypto";
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeliveryRejectedError } from "../src/errors/DeliveryRejectedError.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DeliveryDispatcher } from "../src/outbox/DeliveryDispatcher.js";
import { OutboxRelay } from "../src/outbox/OutboxRelay.js";
import { writeEvent } from "../src/outbox/write-event.js";
import { BullMqDeliveryQueueImpl } from "../src/providers/delivery-queue/BullMqDeliveryQueueImpl.js";
import type { IMessagingProvider } from "../src/providers/messaging/IMessagingProvider.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

const RETRY: DeliveryRetryPolicy = { baseMs: 20, factor: 2, capMs: 100, jitter: 0, attempts: 3 };
const clock = { now: () => new Date() };

/** Each email send waits here until the test settles it. */
const sends: { resolve: () => void; reject: (err: Error) => void }[] = [];
const messaging: IMessagingProvider = {
  sendEmail: () => new Promise<void>((resolve, reject) => sends.push({ resolve, reject })),
  sendSms: () => Promise.reject(new Error("No texts in this test")),
};

let db: pg.Client;
let stopDb: () => Promise<void>;
let prisma: PrismaClient;
let redis: StartedRedisContainer;
let uow: PrismaUnitOfWorkImpl;
let dispatcher: DeliveryDispatcher;
let queue: BullMqDeliveryQueueImpl | undefined;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop: stopDb } = await startMigratedDatabase());
  redis = await new RedisContainer("redis:7-alpine").start();
  prisma = createPrismaClient(url);
  uow = new PrismaUnitOfWorkImpl(
    prisma,
    new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
  );
  dispatcher = new DeliveryDispatcher(uow, {
    crm: { upsertListing: () => Promise.reject(new Error("No CRM in this test")) },
    messaging,
    clock,
    retry: RETRY,
    brandId: "test",
  });
  await db.query(`
    INSERT INTO "Brand" (id, name, tokens, content, hosts, "updatedAt")
      VALUES ('test', 'Test Homes', '{}', '{}', '{localhost}', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
      VALUES ('investor-1', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now()),
             ('investor-2', 'Harbor', 'Hal', 'harbor@example.test', 'DIRECT_BUYER', now());
  `);
});

afterAll(async () => {
  await queue?.close();
  await prisma?.$disconnect();
  await redis?.stop();
  await stopDb?.();
});

/** Writes an email notice to the investor and relays it; returns the delivery's ID. */
async function emailDelivery(investorId: string): Promise<string> {
  await uow.run((repos) =>
    writeEvent(repos, {
      type: "investor.notice",
      payload: {
        packageId: "package-1",
        investorId,
        noticeType: "PACKAGE_MATCHED",
        title: "A new listing matches your buy box",
        body: "A listing in Austin, TX 78704 matches Flips.",
        channels: ["EMAIL"],
      },
    }),
  );
  await new OutboxRelay(uow, { queue: { enqueue: async () => {} }, clock }).tick();
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM "Delivery" WHERE "recipientRef" = $1`,
    [investorId],
  );
  return rows[0]!.id;
}

const statusOf = async (id: string) =>
  (
    await db.query<{ status: string; attempts: number; lastError: string | null }>(
      `SELECT status, attempts, "lastError" FROM "Delivery" WHERE id = $1`,
      [id],
    )
  ).rows[0];

async function until(check: () => boolean | Promise<boolean>, what: string) {
  const deadline = Date.now() + 15_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("a delivery's claim", () => {
  it("keeps a run that lost its claim from recording its outcome over the newer run's", async () => {
    const id = await emailDelivery("investor-1");
    const oldRun = dispatcher.dispatch(id);
    await until(() => sends.length === 1, "the first send");
    // The first send outlives the lease: the sweep puts the delivery back and a newer run takes it.
    await uow.run((repos) => repos.deliveries.requeueStale(new Date(Date.now() + 60_000)));
    const newRun = dispatcher.dispatch(id);
    await until(() => sends.length === 2, "the second send");

    sends[0]!.reject(new DeliveryRejectedError("The sandbox refused (400)"));
    await oldRun;
    sends[1]!.resolve();
    await newRun;

    expect(await statusOf(id)).toMatchObject({ status: "SENT", attempts: 2 });
  });
});

describe("a dispatch that keeps throwing", () => {
  it("ends the delivery set aside with the error once its job has used every attempt", async () => {
    const id = await emailDelivery("investor-2");
    queue = new BullMqDeliveryQueueImpl({
      redisUrl: redis.getConnectionUrl(),
      retry: RETRY,
      reporter: { report: () => {} },
    });
    queue.startConsumer(
      {
        dispatch: () => Promise.reject(new Error("The database connection was lost")),
        giveUp: (deliveryId, error) => dispatcher.giveUp(deliveryId, error),
      },
      { concurrency: 1, onSetAside: () => {} },
    );

    await queue.enqueue([id]);

    await until(async () => (await statusOf(id))?.status === "NEEDS_ATTENTION", "set aside");
    expect((await statusOf(id))?.lastError).toContain("The database connection was lost");
  });
});
