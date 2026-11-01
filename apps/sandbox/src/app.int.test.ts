// Guards the sandbox stand-ins against a real Postgres (T338): the CRM applies a keyed update once
// and refuses an older one, a repeated message key stores one message, writes need the shared
// token, outage modes are per service, and the inspection page escapes what it shows.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Express } from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

const TOKEN = "test-internal-token";
const SLOW_MS = 300;

let database: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: Express;

beforeAll(async () => {
  database = await new PostgreSqlContainer("postgres:17-alpine").start();
  pool = new pg.Pool({ connectionString: database.getConnectionUri(), max: 5 });
  const store = createStore(pool);
  await store.ensureSchema();
  app = createApp({
    storageDir: mkdtempSync(join(tmpdir(), "sandbox-int-")),
    signingKey: "test-signing-key",
    internalToken: TOKEN,
    webOrigin: "http://localhost:3000",
    now: () => new Date(),
    store,
    slowDelayMs: SLOW_MS,
  });
});

afterAll(async () => {
  await pool?.end();
  await database?.stop();
});

const crmUpdate = (overrides: Record<string, unknown> = {}) => ({
  status: "ACCEPTING_OFFERS",
  round: 1,
  offerCount: 0,
  acceptedPrice: null,
  sellerContact: { fullName: "Sam Seller", email: "sam@example.com", phone: null },
  occurredAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

const putCrm = (packageId: string, key: string, body: object) =>
  request(app)
    .put(`/crm/listings/${packageId}`)
    .set("x-sandbox-token", TOKEN)
    .set("Idempotency-Key", key)
    .send(body);

const crmRecord = async (packageId: string) => {
  const res = await request(app).get("/crm/listings").set("x-sandbox-token", TOKEN).expect(200);
  return (res.body.listings as { packageId: string; status: string }[]).find(
    (l) => l.packageId === packageId,
  );
};

const setMode = (service: string, mode: string) =>
  request(app)
    .put(`/simulation/${service}`)
    .set("x-sandbox-token", TOKEN)
    .send({ mode })
    .expect(200);

const sendSms = (key: string) =>
  request(app)
    .post("/messages/sms")
    .set("x-sandbox-token", TOKEN)
    .set("Idempotency-Key", key)
    .send({ to: "+15555550100", body: "A new listing matches your buy box." });

describe("sandbox CRM", () => {
  it("applies a keyed update once and replays the stored answer for the same key", async () => {
    await putCrm("pkg-once", "delivery-1", crmUpdate()).expect(200, { result: "APPLIED" });
    const replay = await putCrm(
      "pkg-once",
      "delivery-1",
      crmUpdate({ status: "CLOSED", occurredAt: "2026-11-01T11:00:00.000Z" }),
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ result: "APPLIED" });
    expect((await crmRecord("pkg-once"))?.status).toBe("ACCEPTING_OFFERS");
  });

  it("refuses an update older than the stored one with 409 STALE and keeps the newer record", async () => {
    await putCrm("pkg-stale", "delivery-2", crmUpdate({ status: "UNDER_CONTRACT" })).expect(200);
    const older = crmUpdate({ status: "ACCEPTING_OFFERS", occurredAt: "2026-11-01T09:00:00.000Z" });
    await putCrm("pkg-stale", "delivery-3", older).expect(409, { code: "STALE" });
    await putCrm("pkg-stale", "delivery-3", older).expect(409, { code: "STALE" });
    expect((await crmRecord("pkg-stale"))?.status).toBe("UNDER_CONTRACT");
  });

  it("refuses CRM writes, message posts, and mode changes without the shared token", async () => {
    await request(app)
      .put("/crm/listings/pkg-auth")
      .set("Idempotency-Key", "delivery-4")
      .send(crmUpdate())
      .expect(401);
    await request(app)
      .post("/messages/sms")
      .set("x-sandbox-token", "wrong-token-0123456789")
      .set("Idempotency-Key", "delivery-5")
      .send({ to: "+15555550100", body: "Hello" })
      .expect(401);
    await request(app).put("/simulation/crm").send({ mode: "down" }).expect(401);
    expect(await crmRecord("pkg-auth")).toBeUndefined();
  });
});

describe("sandbox messaging", () => {
  it("stores one message for a repeated Idempotency-Key", async () => {
    const count = async () =>
      ((await request(app).get("/messages").expect(200)).body.messages as unknown[]).length;
    const before = await count();
    const first = await sendSms("delivery-6").expect(201);
    const second = await sendSms("delivery-6").expect(201);
    expect(second.body).toEqual(first.body);
    expect(await count()).toBe(before + 1);
  });
});

describe("sandbox outage modes", () => {
  afterEach(async () => {
    await setMode("crm", "up");
  });

  it("fails only the service that is down; the other service and the read-outs still work", async () => {
    await setMode("crm", "down");
    await putCrm("pkg-down", "delivery-7", crmUpdate()).expect(503, {
      error: "Simulated outage",
    });
    await sendSms("delivery-8").expect(201);
    await request(app).get("/crm/listings").set("x-sandbox-token", TOKEN).expect(200);
    await request(app).get("/").expect(200);
    expect(await crmRecord("pkg-down")).toBeUndefined();
  });

  it("answers 200 with a body that is not JSON in garbage mode, and applies nothing", async () => {
    await setMode("crm", "garbage");
    const res = await putCrm("pkg-garbage", "delivery-9", crmUpdate())
      .buffer(true)
      // The raw body: supertest's JSON parser would throw on garbage.
      .parse((raw, done) => {
        let text = "";
        raw.on("data", (chunk: Buffer) => (text += chunk.toString()));
        raw.on("end", () => done(null, text));
      });
    expect(res.status).toBe(200);
    expect(() => JSON.parse(res.body as string)).toThrow();
    expect(await crmRecord("pkg-garbage")).toBeUndefined();
  });

  it("delays the response in slow mode, then handles the request", async () => {
    await setMode("crm", "slow");
    const started = Date.now();
    await putCrm("pkg-slow", "delivery-10", crmUpdate()).expect(200, { result: "APPLIED" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(SLOW_MS);
  });
});

describe("sandbox inspection page", () => {
  it("escapes stored values", async () => {
    await putCrm("pkg-xss", "delivery-11", crmUpdate({ status: "<b>BOLD</b>" })).expect(200);
    await request(app)
      .post("/messages/email")
      .set("x-sandbox-token", TOKEN)
      .set("Idempotency-Key", "delivery-12")
      .send({ to: "ivy@example.com", subject: "<script>alert(1)</script>", body: "Hi" })
      .expect(201);
    const page = await request(app).get("/").expect(200);
    expect(page.headers["content-type"]).toMatch(/text\/html/);
    expect(page.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page.text).toContain("&lt;b&gt;BOLD&lt;/b&gt;");
    expect(page.text).not.toContain("<script>");
    expect(page.text).not.toContain("<b>BOLD");
  });
});
