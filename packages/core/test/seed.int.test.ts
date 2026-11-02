// Guards the seed's promises (T260, T299, T314, T409): running it again (every `docker compose up`
// does) adds nothing; the demo agent can sign in with the README's credentials through the real
// service; the seeded buy boxes match the sample listing exactly as expected-matches.json says; and
// the Los Angeles listings are seeded once, each published one matched to exactly the investors
// expected-matches.json names, with the sellers stored encrypted. Seeded in run.ts's order, the
// listings are matched by the real workflow: each match has the decision behind the ops console's
// "Why?" and the version its investor was told about; each offer writes the CRM event that brings
// the deal demo's CRM count to four (T373); and the accepted offer's deal is under contract.
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { DEAL_DEMO, LISTINGS } from "../src/infra/seed/la-listings.js";
import { seedConfig, seedListings } from "../src/infra/seed/listings.js";
import { DEMO_PASSWORD, seedBuyBoxVersions, seedDemoAccounts } from "../src/infra/seed/seed.js";
import { createAddressHasher } from "../src/providers/pii-cipher/address-hasher.js";
import expected from "../src/infra/seed/expected-matches.json" with { type: "json" };
import { evaluateBuyBox } from "../src/registry/evaluate-buy-box.js";
import type { ListingFacts } from "../src/registry/listing-facts.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { AuthService } from "../src/services/auth/AuthService.js";
import { OpsQueryService } from "../src/services/ops/OpsQueryService.js";
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
    await seedBuyBoxVersions(prisma);
    await seedDemoAccounts(prisma);
    await seedBuyBoxVersions(prisma);
    const counts = await db.query(
      `SELECT (SELECT count(*) FROM "Agent")::int AS agents, (SELECT count(*) FROM "User")::int AS users,
              (SELECT count(*) FROM "Investor")::int AS investors, (SELECT count(*) FROM "BuyBox")::int AS boxes,
              (SELECT count(*) FROM "BuyBoxVersion")::int AS versions`,
    );
    expect(counts.rows[0]).toEqual({ agents: 2, users: 8, investors: 5, boxes: 7, versions: 7 });

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

  it("seeds the listings once, each matched as expected-matches.json says, sellers encrypted", async () => {
    await seedDemoAccounts(prisma);
    const cipher = new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`);
    const addressHash = createAddressHasher("test-hash-key");
    const photosDir = fileURLToPath(new URL("../../../seed/photos/", import.meta.url));
    const deps = { cipher, addressHash, photosDir };
    // run.ts's order: buy box versions before the listings.
    await seedConfig(prisma);
    await seedBuyBoxVersions(prisma);
    await seedListings(prisma, deps);
    await seedListings(prisma, deps);

    expect(await prisma.listingPackage.count()).toBe(LISTINGS.length);
    const sellers = await db.query(`SELECT "fullName", email, phone FROM "Seller"`);
    for (const { seller } of LISTINGS) {
      expect(JSON.stringify(sellers.rows)).not.toContain(seller.fullName);
      expect(JSON.stringify(sellers.rows)).not.toContain(seller.phone);
    }

    // Each published listing is matched to exactly the investors the file names; drafts to none.
    const packageAt = (streetLine: string, zip: string) =>
      prisma.listingPackage.findFirstOrThrow({
        where: { addressHash: addressHash({ streetLine, zip }) },
        include: { matches: { include: { investor: { select: { email: true } } } } },
      });
    const seeded: Record<string, string[]> = {};
    for (const listing of LISTINGS) {
      const pkg = await packageAt(listing.streetLine, listing.zip);
      if (listing.deadlineInDays === null) {
        expect(pkg).toMatchObject({ status: "DRAFT", matches: [] });
        continue;
      }
      seeded[listing.streetLine] = pkg.matches.map((m) => m.investor.email).sort();
      expect(pkg.status).toBe(listing.acceptedInvestor ? "UNDER_CONTRACT" : "ACCEPTING_OFFERS");
    }
    expect(seeded).toEqual(expected.seededListings);

    // Each listing has exactly its photos, in order, once (the seed ran twice); the drafts have
    // none. They point at the files the sandbox stores under packages/seed/ (T420).
    for (const listing of LISTINGS) {
      const pkg = await packageAt(listing.streetLine, listing.zip);
      const photos = await prisma.photo.findMany({
        where: { packageId: pkg.id },
        orderBy: { position: "asc" },
      });
      expect(photos.map((p) => p.storageKey)).toEqual(
        (listing.photos ?? []).map((file) => `packages/seed/${file}`),
      );
      if (listing.deadlineInDays === null) expect(photos).toEqual([]);
    }

    // Every matched box really fits the version its investor was told about (FR-022).
    const uow = new PrismaUnitOfWorkImpl(prisma, cipher);
    const matches = await prisma.match.findMany();
    const today = new Date().toISOString().slice(0, 10);
    for (const match of matches) {
      expect(match.lastNotifiedListingVersion).toBe(1);
      const version = await uow.run((repos) => repos.listingVersions.find(match.packageId, 1));
      const boxes = await uow.run((repos) =>
        repos.buyBoxes.listCandidates(version!.snapshot.zip, version!.snapshot.state, new Date()),
      );
      for (const id of match.matchedBuyBoxIds) {
        const box = boxes.find((b) => b.id === id);
        expect(box && evaluateBuyBox(box, version!.snapshot, today).matched).toBe(true);
      }
    }

    // "Why?" shows the stored decision with each box's criteria.
    const demo = await packageAt(DEAL_DEMO.streetLine, DEAL_DEMO.zip);
    const ops = { userId: "user-ops", role: "OPS" as const, agentId: null };
    const why = await new OpsQueryService(uow).explainMatch(
      ops,
      demo.id,
      demo.matches[0]!.investorId,
    );
    expect(why).toMatchObject({ source: "STORED", matched: true });
    expect(why.buyBoxes.length).toBeGreaterThan(0);
    // Every offer writes its CRM event; the deal demo's last one carries all four of its offers.
    const events = await db.query(
      `SELECT payload FROM "OutboxEvent" WHERE type = 'offer.submitted'`,
    );
    const offerCount = LISTINGS.reduce((n, listing) => n + (listing.offers?.length ?? 0), 0);
    expect(events.rows).toHaveLength(offerCount);
    const demoCounts = events.rows
      .filter((row) => row.payload.packageId === demo.id)
      .map((row) => row.payload.crm.offerCount);
    expect(demoCounts.sort()).toEqual([1, 2, 3, 4]);
  });
});
