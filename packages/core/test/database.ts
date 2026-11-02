// Starts a throwaway Postgres 17 with every migration applied, for the table tests. Each test file
// gets its own database, so tests never share rows and need no cleanup between them. `timeZone`
// sets the database's own time zone, as a server outside UTC would have, for the time rules (T390).
import { execFileSync } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";

export async function startMigratedDatabase({ timeZone }: { timeZone?: string } = {}) {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  execFileSync("prisma", ["migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const db = new pg.Client({ connectionString: container.getConnectionUri() });
  await db.connect();
  // Applies to the sessions opened after it, so this setup session stays in UTC.
  if (timeZone)
    await db.query(`ALTER DATABASE "${container.getDatabase()}" SET timezone TO '${timeZone}'`);
  return {
    db,
    url: container.getConnectionUri(),
    stop: async () => {
      await db.end();
      await container.stop();
    },
  };
}
