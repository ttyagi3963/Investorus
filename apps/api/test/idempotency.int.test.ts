// Checks the idempotency rules end to end against a real Postgres (T284; constitution XX.2): every
// POST and PATCH needs an Idempotency-Key; a retry with the same key and body replays the stored
// answer without running the change again; a duplicate sent while the first is still running gets
// 409, and a different body 422; a 5xx is not stored; keys are per user; a store outage fails
// closed with 503. The real container supplies the key store; the services are fakes.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { Actor } from "@clever/contracts/auth";
import { UnauthenticatedError } from "@clever/contracts/common";
import type { AgentPackageView } from "@clever/contracts/listing-package";
import type { AgentPackage } from "@clever/core";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Express } from "express";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createContainer, type AppContainer } from "../src/container.js";
import { apiEnvSchema } from "../src/env.js";

const CORE = join(import.meta.dirname, "../../../packages/core");
const ACTORS: Record<string, Actor> = {
  avery: { userId: "user-a", role: "AGENT", agentId: "agent-a" },
  blake: { userId: "user-b", role: "AGENT", agentId: "agent-b" },
};

let database: StartedPostgreSqlContainer;
const containers: AppContainer[] = [];
let calls = 0;
/** What the fake create does next; by default it answers 201 at once. */
let nextCreate: () => Promise<void> = async () => {};

const envFor = (databaseUrl: string) =>
  apiEnvSchema.parse({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString("hex"),
    PII_ENCRYPTION_KEY: `v1:${randomBytes(32).toString("base64")}`,
    ADDRESS_HASH_KEY: "test-address-hash-key",
    SANDBOX_URL: "http://sandbox.invalid",
    PUBLIC_SANDBOX_URL: "http://sandbox.invalid",
    SANDBOX_INTERNAL_TOKEN: "test-internal-token",
    STORAGE_SIGNING_KEY: "test-storage-signing-key",
    STORAGE_PROVIDER: "sandbox",
    LOG_LEVEL: "silent",
  });

/** The api over a real key store at `databaseUrl`, with fake sign-in and package services. */
function appOver(databaseUrl: string): Express {
  const real = createContainer(envFor(databaseUrl));
  containers.push(real);
  return createApp({
    ...real,
    auth: {
      ...real.auth,
      verify: async (token) => {
        const actor = ACTORS[token];
        if (!actor) throw new UnauthenticatedError("Sign in again");
        return actor;
      },
    },
    packages: {
      ...real.packages,
      create: async () => {
        calls += 1;
        await nextCreate();
        return { package: { id: `package-${calls}` } } as AgentPackage;
      },
    },
    presentPackage: async (parts) => ({ id: parts.package.id }) as AgentPackageView,
  });
}

let app: Express;
const post = (as: string, key: string | undefined, body: object = { price: 1 }) => {
  const req = request(app).post("/api/v1/listing-packages").set("Authorization", `Bearer ${as}`);
  return (key ? req.set("Idempotency-Key", key) : req).send(body);
};

beforeAll(async () => {
  database = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = database.getConnectionUri();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: CORE,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt") VALUES
      ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now()),
      ('agent-b', 'Blake', 'blake@example.test', 'Demo Realty', now());
    INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "updatedAt") VALUES
      ('user-a', 'avery@example.test', 'hash', 'AGENT', 'Avery', 'agent-a', now()),
      ('user-b', 'blake@example.test', 'hash', 'AGENT', 'Blake', 'agent-b', now());
  `);
  await db.end();
  app = appOver(url);
});

afterAll(async () => {
  await Promise.all(containers.map((c) => c.dispose()));
  await database?.stop();
});

describe("idempotency", () => {
  it("refuses a POST without an Idempotency-Key", async () => {
    const res = await post("avery", undefined).expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("replays the stored answer for a retry, and refuses the same key with a different body", async () => {
    const before = calls;
    const first = await post("avery", "key-replay").expect(201);
    const retry = await post("avery", "key-replay").expect(201);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers["idempotent-replay"]).toBe("true");
    expect(calls - before).toBe(1);

    const changed = await post("avery", "key-replay", { price: 2 }).expect(422);
    expect(changed.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("answers a duplicate sent while the first is running with 409 and Retry-After: 1", async () => {
    let release!: () => void;
    let entered!: () => void;
    const running = new Promise<void>((resolve) => (entered = resolve));
    nextCreate = () => {
      entered();
      return new Promise((resolve) => (release = resolve));
    };
    const first = post("avery", "key-concurrent").then((res) => res);
    await running;
    nextCreate = async () => {};

    const duplicate = await post("avery", "key-concurrent").expect(409);
    expect(duplicate.headers["retry-after"]).toBe("1");
    release();
    expect((await first).status).toBe(201);
  });

  it("does not store a 5xx, so a retry runs the change again", async () => {
    nextCreate = async () => {
      throw new Error("the change failed unexpectedly");
    };
    await post("avery", "key-failure").expect(500);
    nextCreate = async () => {};
    const before = calls;
    await post("avery", "key-failure").expect(201);
    expect(calls - before).toBe(1);
  });

  it("keeps keys per user", async () => {
    const before = calls;
    await post("avery", "key-shared").expect(201);
    const other = await post("blake", "key-shared").expect(201);
    expect(other.headers["idempotent-replay"]).toBeUndefined();
    expect(calls - before).toBe(2);
  });

  it("fails closed with 503 and Retry-After: 5 when the key store is unreachable", async () => {
    const offline = appOver("postgresql://nobody:nothing@127.0.0.1:1/none");
    const before = calls;
    const res = await request(offline)
      .post("/api/v1/listing-packages")
      .set("Authorization", "Bearer avery")
      .set("Idempotency-Key", "key-offline")
      .send({ price: 1 })
      .expect(503);
    expect(res.headers["retry-after"]).toBe("5");
    expect(calls).toBe(before);
  });
});
