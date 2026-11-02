// Gives a test file its own Postgres 17 database with every migration applied, for the table tests:
// a copy of the template the global setup migrated (test/migrated-template.ts), so tests never share
// rows and need no cleanup between them. `timeZone` sets the database's own time zone, as a server
// outside UTC would have, for the time rules (T390).
import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";

/** Runs one statement on the shared server's `postgres` database, outside any test database. */
async function onServer(serverUrl: string, sql: string) {
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

export async function startMigratedDatabase({ timeZone }: { timeZone?: string } = {}) {
  const { serverUrl, template } = inject("postgres");
  const name = `test_${randomBytes(6).toString("hex")}`;
  await onServer(serverUrl, `CREATE DATABASE "${name}" TEMPLATE "${template}"`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  // Applies to the sessions opened after it, so this setup session stays in UTC.
  if (timeZone) await db.query(`ALTER DATABASE "${name}" SET timezone TO '${timeZone}'`);
  return {
    db,
    url: url.toString(),
    stop: async () => {
      await db.end();
      // FORCE closes what the file left open (a Prisma pool, the sandbox process).
      await onServer(serverUrl, `DROP DATABASE "${name}" WITH (FORCE)`);
    },
  };
}
