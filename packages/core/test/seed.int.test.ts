// Guards the seed's promises (T260, T299): running it again (every `docker compose up` does) adds
// nothing; the demo agent can sign in with the README's credentials through the real service; and
// the seeded buy boxes match the sample listing exactly as seed/expected-matches.json says.
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DEMO_PASSWORD, seedDemoAccounts } from "../src/infra/seed/seed.js";
import expected from "../src/infra/seed/expected-matches.json" with { type: "json" };
import { evaluateBuyBox } from "../src/registry/evaluate-buy-box.js";
import type { ListingFacts } from "../src/registry/listing-facts.js";
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
      `SELECT (SELECT count(*) FROM "Agent")::int AS agents, (SELECT count(*) FROM "User")::int AS users,
              (SELECT count(*) FROM "Investor")::int AS investors, (SELECT count(*) FROM "BuyBox")::int AS boxes`,
    );
    expect(counts.rows[0]).toEqual({ agents: 1, users: 4, investors: 3, boxes: 4 });

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

  it("matches the sample listing to exactly the investors expected-matches.json names", async () => {
    await seedDemoAccounts(prisma);
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const listing = expected.listing as ListingFacts;
    const boxes = await uow.run((repos) =>
      repos.buyBoxes.listCandidates(listing.zip, listing.state, new Date()),
    );
    const matched = boxes.filter((box) => evaluateBuyBox(box, listing, expected.today).matched);
    const investors = await db.query(`SELECT id, email FROM "Investor"`);
    const emailOf = Object.fromEntries(investors.rows.map((r) => [r.id, r.email]));
    const byEmail: Record<string, string[]> = {};
    for (const box of matched) (byEmail[emailOf[box.investorId]] ??= []).push(box.name);
    for (const names of Object.values(byEmail)) names.sort();
    expect(byEmail).toEqual(expected.matches);
  });
});
