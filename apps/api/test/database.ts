// The api integration tests' setup: a throwaway Postgres 17 with every migration applied, and api
// settings that point at it. Each test file gets its own database, so files never share rows.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import { apiEnvSchema, type ApiEnv } from "../src/env.js";

const CORE = join(import.meta.dirname, "../../../packages/core");

export async function startMigratedDatabase() {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: CORE,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  return {
    db,
    url,
    stop: async () => {
      await db.end();
      await container.stop();
    },
  };
}

/** The api's settings over the database at `databaseUrl`; the sandbox is never reached. */
export const envFor = (databaseUrl: string): ApiEnv =>
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
