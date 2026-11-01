// Checks the User table's role rule against a real Postgres. Prisma cannot express the rule, so
// the migration adds it as a hand-written CHECK: an AGENT links to an Agent only, an INVESTOR to
// an Investor only, and OPS to neither.
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
  await db.query(
    `INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "updatedAt")
     VALUES ('investor-1', 'Summit Capital', 'Sam Summit', 'summit@example.test', 'DIRECT_BUYER', now())`,
  );
});

afterAll(() => stop?.());

const insertUser = (
  email: string,
  role: string,
  agentId: string | null,
  investorId: string | null = null,
) =>
  db.query(
    `INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "investorId", "updatedAt")
     VALUES ($1, $1, 'hash', $2, 'Name', $3, $4, now())`,
    [email, role, agentId, investorId],
  );

describe("User table", () => {
  it("links each role to exactly its own record: AGENT an Agent, INVESTOR an Investor, OPS neither", async () => {
    await expect(insertUser("avery@example.com", "AGENT", "agent-1")).resolves.toBeDefined();
    await expect(
      insertUser("summit@example.com", "INVESTOR", null, "investor-1"),
    ).resolves.toBeDefined();
    await expect(insertUser("morgan@example.com", "OPS", null)).resolves.toBeDefined();
    await expect(insertUser("lost@example.com", "INVESTOR", null)).rejects.toThrow(
      /User_role_link_check/,
    );
    await expect(insertUser("both@example.com", "AGENT", "agent-1", "investor-1")).rejects.toThrow(
      /User_role_link_check/,
    );
    await expect(insertUser("none@example.com", "AGENT", null)).rejects.toThrow(
      /User_role_link_check/,
    );
    await expect(insertUser("linked@example.com", "OPS", "agent-1")).rejects.toThrow(
      /User_role_link_check/,
    );
  });
});
