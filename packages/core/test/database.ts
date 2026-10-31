// Starts a throwaway Postgres 17 with every migration applied, for the table tests. Each test file
// gets its own database, so tests never share rows and need no cleanup between them.
import { execFileSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

export async function startMigratedDatabase() {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  execFileSync("prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const db = new pg.Client({ connectionString: container.getConnectionUri() });
  await db.connect();
  return {
    db,
    stop: async () => {
      await db.end();
      await container.stop();
    },
  };
}
