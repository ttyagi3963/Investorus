// Drives the main flow over HTTP through the real middleware, services, and Postgres (T402; test
// review TEST-04): sign in, create, publish, the investor's read without the seller (XII), an
// offer, and the accept, with the error translator's answers for an unsigned change, a wrong role,
// and a second accept. The worker does not run here: its matching is stood in for by the Match row
// it would write (MatchingWorkflow is covered in packages/core), and the photo by its row, since
// adding one through the api checks the object in storage, which is the sandbox.
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createContainer, type AppContainer } from "../src/container.js";
import { envFor, startMigratedDatabase } from "./database.js";

const PASSWORD = "demo-password-1";
/** bcrypt of PASSWORD at cost 4, so sign-in runs the real comparison quickly. */
const PASSWORD_HASH = "$2b$04$oLuARhaWr8B7hC1Qyn5P6.lLMaulh00G9QZ./TIBfxzFQYsrF0Q.a";
const seller = {
  fullName: "Ottoline Quillfeather",
  email: "ottoline.quillfeather@example.test",
  phone: "+15125550187",
};
const STREET = "4471 Wrenfield Hollow Rd";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const day = (days: number) => inDays(days).toISOString().slice(0, 10);

let db: pg.Client;
let stopDb: () => Promise<void>;
let container: AppContainer;
let app: Express;

/** A signed-in POST, each with its own Idempotency-Key. */
const post = (path: string, token: string, body: object) =>
  request(app)
    .post(`/api/v1${path}`)
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", randomUUID())
    .send(body);

const signIn = async (email: string): Promise<string> => {
  const res = await request(app)
    .post("/api/v1/sessions")
    .send({ email, password: PASSWORD })
    .expect(201);
  return res.body.token;
};

beforeAll(async () => {
  let url: string;
  ({ db, url, stop: stopDb } = await startMigratedDatabase());
  await db.query(
    `
    INSERT INTO "Agent" (id, name, email, brokerage, "updatedAt")
      VALUES ('agent-a', 'Avery', 'avery@example.test', 'Demo Realty', now());
    INSERT INTO "Investor" (id, "companyName", "contactName", email, phone, "investorType", "proofOfFundsExpiresAt", "updatedAt")
      VALUES ('summit', 'Summit', 'Sam', 'summit@example.test', '+15125550100', 'DIRECT_BUYER', now() + interval '1 year', now());
    INSERT INTO "User" (id, email, "passwordHash", role, "displayName", "agentId", "investorId", "updatedAt") VALUES
      ('user-a', 'avery@example.test', '${PASSWORD_HASH}', 'AGENT', 'Avery', 'agent-a', NULL, now()),
      ('user-summit', 'summit@example.test', '${PASSWORD_HASH}', 'INVESTOR', 'Sam', NULL, 'summit', now());
  `,
  );
  container = createContainer(envFor(url));
  app = createApp(container);
});

afterAll(async () => {
  await container?.dispose();
  await stopDb?.();
});

describe("the api over HTTP", () => {
  it("takes a package from sign-in to an accepted offer, and translates the refusals", async () => {
    await request(app)
      .post("/api/v1/listing-packages")
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(401);

    const agent = await signIn("avery@example.test");
    const investor = await signIn("summit@example.test");

    const created = await post("/listing-packages", agent, {
      seller,
      property: {
        streetLine: STREET,
        zip: "78704",
        propertyType: "SINGLE_FAMILY",
        beds: 3,
        baths: 2,
        sqft: 1_600,
        yearBuilt: 1985,
        condition: "FAIR",
      },
      priceExpectationMin: 250_000,
      priceExpectationMax: 300_000,
      closingWindowStart: day(20),
      closingWindowEnd: day(45),
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER"],
    }).expect(201);
    const packageId: string = created.body.id;
    expect(created.body.status).toBe("DRAFT");

    await db.query(
      `INSERT INTO "Photo" (id, "packageId", "storageKey", "contentType", "sizeBytes", position)
         VALUES ('photo-1', $1, 'photos/0.jpg', 'image/jpeg', 1000, 0)`,
      [packageId],
    );
    const published = await post(`/listing-packages/${packageId}/publication`, agent, {
      version: created.body.version,
    }).expect(200);
    expect(published.body.status).toBe("ACCEPTING_OFFERS");
    await db.query(
      `INSERT INTO "Match" (id, "packageId", "investorId", round, "matchedBuyBoxIds", trigger)
         VALUES ('match-1', $1, 'summit', 1, '{}', 'PUBLISH')`,
      [packageId],
    );

    const seen = await request(app)
      .get(`/api/v1/investor/packages/${packageId}`)
      .set("Authorization", `Bearer ${investor}`)
      .expect(200);
    expect(seen.body.id).toBe(packageId);
    for (const detail of [seller.fullName, seller.email, seller.phone, STREET]) {
      expect(JSON.stringify(seen.body)).not.toContain(detail);
    }

    const offer = await post(`/listing-packages/${packageId}/offers`, investor, {
      price: 280_000,
      paymentType: "CASH",
      closingDate: day(30),
      earnestMoney: 5_000,
      contingencies: ["INSPECTION"],
      feesAndConcessions: 0,
      expiresAt: inDays(2).toISOString(),
    }).expect(201);
    const accept = { type: "ACCEPT", offerId: offer.body.id, version: offer.body.version };
    const decisions = `/listing-packages/${packageId}/decisions`;

    const wrongRole = await post(decisions, investor, accept).expect(403);
    expect(wrongRole.body.code).toBe("FORBIDDEN");

    const decision = await post(decisions, agent, accept).expect(201);
    expect(decision.body.type).toBe("ACCEPT");

    const again = await post(decisions, agent, accept).expect(409);
    expect(again.body.code).toBe("PACKAGE_HAS_ACCEPTED_OFFER");
  });
});
