// Checks the User table's role rule against a real Postgres. Prisma cannot express the rule, so
// the migration adds it as a hand-written CHECK: an AGENT must link to an Agent, and OPS must not.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ db, stop } = await startMigratedDatabase());
  await db.query(
    `INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
     VALUES ('agent-1', 'Avery Agent', 'avery@example.test', 'Demo Realty', now())`,
  );
});

afterAll(() => stop?.());

const insertUser = (email: string, role: string, agentId: string | null) =>
  db.query(
    `INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "updatedAt")
     VALUES ($1, $1, 'hash', $2, 'Name', $3, now())`,
    [email, role, agentId],
  );

describe("User table", () => {
  it("links an AGENT to exactly one Agent and an OPS user to none", async () => {
    await expect(insertUser("avery@example.com", "AGENT", "agent-1")).resolves.toBeDefined();
    await expect(insertUser("morgan@example.com", "OPS", null)).resolves.toBeDefined();
    await expect(insertUser("none@example.com", "AGENT", null)).rejects.toThrow(
      /User_role_link_check/,
    );
    await expect(insertUser("linked@example.com", "OPS", "agent-1")).rejects.toThrow(
      /User_role_link_check/,
    );
  });
});
