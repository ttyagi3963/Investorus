// Guards the seed's two promises (T260): running it again (every `docker compose up` does) adds
// nothing, and the demo agent can sign in with the README's credentials through the real service.
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DEMO_PASSWORD, seedDemoAccounts } from "../src/infra/seed/seed.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { AuthService } from "../src/services/auth/AuthService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("seed", () => {
  it("can run twice without duplicates, and the demo agent can sign in", async () => {
    await seedDemoAccounts(prisma);
    await seedDemoAccounts(prisma);
    const counts = await db.query(
      `SELECT (SELECT count(*) FROM "Agent")::int AS agents, (SELECT count(*) FROM "User")::int AS users`,
    );
    expect(counts.rows[0]).toEqual({ agents: 1, users: 1 });

    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const auth = new AuthService(uow, {
      jwtSecret: randomBytes(32).toString("hex"),
      clock: { now: () => new Date() },
    });
    const { user } = await auth.signIn({ email: "avery@example.com", password: DEMO_PASSWORD });
    expect(user).toMatchObject({
      email: "avery@example.com",
      role: "AGENT",
      displayName: "Avery Agent",
    });
  });
});
