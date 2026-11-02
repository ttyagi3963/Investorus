// Vitest global setup for the core integration tests: starts one Postgres 17 for the whole run and
// migrates it once into a template database, which each test file copies (test/database.ts), so a
// run pays for one container and one `prisma migrate deploy` instead of one per file.
import { execFileSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

const TEMPLATE = "migrated";

declare module "vitest" {
  export interface ProvidedContext {
    /** The shared server, through its `postgres` database, and the migrated template's name. */
    postgres: { serverUrl: string; template: string };
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase(TEMPLATE)
    .start();
  // The migration's connections close when it exits, so nothing holds the template while it is copied.
  execFileSync("prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const serverUrl = new URL(container.getConnectionUri());
  serverUrl.pathname = "/postgres";
  project.provide("postgres", { serverUrl: serverUrl.toString(), template: TEMPLATE });
  return async () => {
    await container.stop();
  };
}
