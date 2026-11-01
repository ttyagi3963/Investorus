// Runs the Sprint 2 loop against a real Postgres (T291, T293): publish a draft, let the queued
// MATCH_PACKAGE job run, and check what the database holds: the open package and its listing
// version, one Match and one notification for the matching investor (none for the other), the
// audit trail, the investor's reads, inbox, and the agent's timeline, and, after a withdrawal,
// the investor told and the address free again.
import { randomBytes } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobHandlers } from "../src/jobs/handlers.js";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { StaticGeoProviderImpl } from "../src/providers/geo/StaticGeoProviderImpl.js";
import { AesGcmPiiCipherImpl } from "../src/providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../src/providers/pii-cipher/address-hasher.js";
import { InvestorPackageQueryService } from "../src/services/investor-package/InvestorPackageQueryService.js";
import { ListingPackageService } from "../src/services/listing-package/ListingPackageService.js";
import { NotificationService } from "../src/services/notification/NotificationService.js";
import { PrismaUnitOfWorkImpl } from "../src/unit-of-work/PrismaUnitOfWorkImpl.js";
import { MatchingWorkflow } from "../src/workflows/matching/MatchingWorkflow.js";
import { OfferRoundWorkflow } from "../src/workflows/offer-round/OfferRoundWorkflow.js";
import { PublicationWorkflow } from "../src/workflows/publication/PublicationWorkflow.js";
import { startMigratedDatabase } from "./database.js";

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
  await db.query(`
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, "investorType", "proofOfFundsExpiresAt", "updatedAt") VALUES
      ('summit', 'Summit', 'Sam', 'summit@example.test', 'DIRECT_BUYER', now() + interval '1 year', now()),
      ('ridge', 'Ridge', 'Rae', 'ridge@example.test', 'DIRECT_BUYER', now() + interval '1 year', now());
    INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "investorId", "updatedAt") VALUES
      ('user-a', 'avery@example.test', 'hash', 'AGENT', 'Avery', 'agent-a', NULL, now()),
      ('user-summit', 'summit@example.test', 'hash', 'INVESTOR', 'Sam', NULL, 'summit', now()),
      ('user-ridge', 'ridge@example.test', 'hash', 'INVESTOR', 'Rae', NULL, 'ridge', now());
    INSERT INTO "BuyBox" (id, "investorId", name, "geographyMode", "propertyTypes", "priceMin", "priceMax", "bathsMin", "updatedAt") VALUES
      ('summit-box', 'summit', 'Austin flips', 'ZIPS', '{SINGLE_FAMILY}', 250000, 300000, 1.5, now()),
      ('ridge-box', 'ridge', 'Starter homes', 'NATIONWIDE', NULL, NULL, 200000, NULL, now());
    INSERT INTO "BuyBoxGeography" (id, "buyBoxId", kind, value) VALUES ('g1', 'summit-box', 'ZIP', '78704');
  `);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

describe("publish and match", () => {
  it("publishes, matches the right investor once, and withdraws", async () => {
    const uow = new PrismaUnitOfWorkImpl(
      prisma,
      new AesGcmPiiCipherImpl(`v1:${randomBytes(32).toString("base64")}`),
    );
    const clock = { now: () => new Date() };
    const packages = new ListingPackageService(uow, {
      geo: new StaticGeoProviderImpl(),
      addressHash: createAddressHasher("test-hash-key"),
      clock,
    });
    const publication = new PublicationWorkflow(uow, { clock });
    const handlers = createJobHandlers({
      matching: new MatchingWorkflow(uow, { clock }),
      offerRound: new OfferRoundWorkflow(uow),
    });
    const inDays = (days: number) =>
      new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const draft = {
      seller: { fullName: "Maria Lopez", phone: "+15551234567" },
      property: {
        streetLine: "12 Elm St",
        zip: "78704",
        propertyType: "SINGLE_FAMILY" as const,
        beds: 3,
        baths: 2,
        sqft: 1_600,
        yearBuilt: 1985,
        condition: "FAIR" as const,
      },
      priceExpectationMin: 250_000,
      priceExpectationMax: 300_000,
      closingWindowStart: inDays(20),
      closingWindowEnd: inDays(45),
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER" as const],
    };
    const { package: created } = await packages.create(avery, draft);
    await uow.run((repos) =>
      repos.photos.add({
        packageId: created.id,
        storageKey: "photos/0.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1_000,
        position: 0,
      }),
    );

    const { package: published } = await publication.publish(avery, created.id, { version: 1 });
    expect(published).toMatchObject({ status: "ACCEPTING_OFFERS", listingVersion: 1 });
    const job = await uow.run((repos) => repos.jobs.claimNext("worker-a", new Date()));
    await handlers[job!.type](job!.payload);
    await uow.run((repos) => repos.jobs.complete(job!.id));

    const matches = await db.query(`SELECT "investorId", "matchedBuyBoxIds" FROM "Match"`);
    expect(matches.rows).toEqual([{ investorId: "summit", matchedBuyBoxIds: ["summit-box"] }]);
    const notices = await db.query(`SELECT "userId", type, body FROM "Notification"`);
    expect(notices.rows.map((n) => [n.userId, n.type])).toEqual([
      ["user-summit", "PACKAGE_MATCHED"],
    ]);
    const snapshot = await db.query(`SELECT snapshot FROM "ListingVersion"`);
    expect(JSON.stringify([notices.rows, snapshot.rows])).not.toMatch(/Elm|Maria|5551234567/);
    const audit = await db.query(`SELECT action FROM "AuditLog" ORDER BY "occurredAt", action`);
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["PACKAGE_PUBLISHED", "MATCH_DECISION", "MATCHING_COMPLETED"]),
    );

    const summit: Actor = { userId: "user-summit", role: "INVESTOR", investorId: "summit" };
    const ridge: Actor = { userId: "user-ridge", role: "INVESTOR", investorId: "ridge" };
    expect((await packages.get(avery, created.id)).matchedCount).toBe(1);
    const reads = new InvestorPackageQueryService(uow);
    expect((await reads.listMatched(summit)).map((p) => p.package.id)).toEqual([created.id]);
    expect(await reads.listMatched(ridge)).toEqual([]);
    const inbox = new NotificationService(uow, { clock });
    const [notice] = await inbox.listMine(summit);
    await inbox.markRead(summit, notice!.id);
    await expect(inbox.markRead(ridge, notice!.id)).rejects.toMatchObject({ status: 404 });
    expect((await packages.timeline(avery, created.id)).map((e) => e.action)).toEqual([
      "MATCHING_COMPLETED",
      "PACKAGE_PUBLISHED",
      "PACKAGE_CREATED",
    ]);

    await publication.withdraw(avery, created.id, { version: published.version });
    const withdrawn = await db.query(`SELECT type FROM "Notification" ORDER BY "createdAt"`);
    expect(withdrawn.rows.map((r) => r.type)).toEqual(["PACKAGE_MATCHED", "PACKAGE_WITHDRAWN"]);
    await expect(packages.create(avery, draft)).resolves.toBeDefined();
  });
});
