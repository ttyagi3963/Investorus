// Guards the app's outer behavior (T232, T255): health answers without a session, the framework
// header is hidden, and an unknown route is a 404 only for a signed-in caller (others get 401, so
// they learn nothing about the routes). Every answer names the request's trace ID, and code behind
// the JSON body parser still runs inside that trace (T283). An investor's package goes out as the
// investor view, without the seller or the street (T298, SC-006). A brand's theme is public and
// cached by its version: a caller holding the current version gets a 304 (T348), however its
// If-None-Match names it (T386).
import { UnauthenticatedError } from "@clever/contracts/common";
import { currentTraceId } from "@clever/core";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppContainer } from "./container.js";

/** Anything a test does not name: reading it gives more of the same, and calling it rejects. */
const notUsed: unknown = new Proxy(() => Promise.reject(new Error("not used in this test")), {
  get: (_target, key) => (key === "then" ? undefined : notUsed),
});
type Stub<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown ? T[K] : Stub<T[K]>;
};
/** A container with only the parts a test names; every other service method is `notUsed`. */
function stub(parts: Stub<AppContainer>): AppContainer {
  const wrap = (value: object): unknown =>
    new Proxy(value, {
      get: (target, key) => {
        const found: unknown = Reflect.get(target, key);
        if (found === undefined) return notUsed;
        const plain =
          typeof found === "object" &&
          found !== null &&
          Object.getPrototypeOf(found) === Object.prototype;
        return plain ? wrap(found) : found;
      },
    });
  return wrap(parts) as AppContainer;
}

const base: Stub<AppContainer> = {
  auth: {
    verify: async (token) => {
      if (token === "investor") {
        return { userId: "user-s", role: "INVESTOR", investorId: "investor-s" };
      }
      if (token !== "good") throw new UnauthenticatedError("Sign in again");
      return { userId: "user-a", role: "AGENT", agentId: "agent-a" };
    },
  },
  addPhotoUrls: (photos) => photos.map((photo) => ({ ...photo, url: "https://storage/p" })),
  checkDatabase: async () => {},
  logger: pino({ level: "silent" }),
  reporter: { report: () => {} },
  dispose: async () => {},
};
const container = stub(base);

describe("api app", () => {
  it("answers the health check without a session", async () => {
    const res = await request(createApp(container)).get("/api/v1/health").expect(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });

  it("hides the framework header, and 404s an unknown route only for a signed-in caller", async () => {
    const app = createApp(container);
    const anonymous = await request(app).get("/api/v1/nope").expect(401);
    expect(anonymous.headers["x-powered-by"]).toBeUndefined();
    await request(app).get("/api/v1/nope").set("Authorization", "Bearer good").expect(404);
  });
});

describe("tracing", () => {
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;

  it("keeps the caller's trace ID through the JSON body to the service, and names it in the error", async () => {
    let seen: string | undefined;
    const app = createApp(
      stub({
        ...base,
        auth: {
          ...base.auth,
          signIn: async () => {
            seen = currentTraceId();
            throw new UnauthenticatedError("Invalid email or password");
          },
        },
      }),
    );
    const res = await request(app)
      .post("/api/v1/sessions")
      .set("traceparent", traceparent)
      .send({ email: "avery@example.com", password: "wrong" })
      .expect(401);
    expect(seen).toBe(traceId);
    expect(res.body.requestId).toBe(traceId);
    expect(res.headers["x-request-id"]).toBe(traceId);
  });

  it("gives a request with a malformed traceparent a fresh trace ID", async () => {
    const res = await request(createApp(container))
      .get("/api/v1/nope")
      .set("traceparent", "00-not-a-trace-01")
      .expect(401);
    expect(res.body.requestId).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });
});

describe("brand routes", () => {
  it("serve a theme without a session, and a 304 to a caller holding its version", async () => {
    const app = createApp(
      stub({
        ...base,
        brands: {
          getTheme: async (brandId) => ({
            brandId,
            tokenVersion: 3,
            cssVariables: {},
            fontFamily: ["Inter"],
            content: {} as never,
          }),
        },
      }),
    );

    const first = await request(app).get("/api/v1/brands/test/theme").expect(200);
    expect(first.headers.etag).toBe('"test-v3"');
    // If-None-Match compares weakly and may list several tags (RFC 9110 13.1.2).
    for (const held of ['"test-v3"', 'W/"test-v3"', '"test-v2", W/"test-v3"']) {
      await request(app).get("/api/v1/brands/test/theme").set("If-None-Match", held).expect(304);
    }
    await request(app)
      .get("/api/v1/brands/test/theme")
      .set("If-None-Match", '"test-v2"')
      .expect(200);
    await request(app).put("/api/v1/ops/brands/test/theme").send({}).expect(401);
  });
});

describe("investor routes", () => {
  it("answer an investor's package with the investor view, which has no seller or street", async () => {
    const at = new Date("2026-11-01T12:00:00Z");
    const app = createApp(
      stub({
        ...base,
        investorPackages: {
          getForInvestor: async () => ({
            package: {
              id: "p1",
              agentId: "a1",
              sellerId: "s1",
              propertyId: "pr1",
              status: "ACCEPTING_OFFERS",
              round: 1,
              priceExpectationMin: 250_000,
              priceExpectationMax: 300_000,
              closingWindowStart: null,
              closingWindowEnd: null,
              currentlyListed: false,
              eligiblePrograms: [],
              offerDeadline: at,
              publishedAt: at,
              listingVersion: 1,
              version: 2,
              createdAt: at,
              updatedAt: at,
            },
            property: {
              id: "pr1",
              streetLine: "12 Elm St",
              zip: "78704",
              city: "Austin",
              state: "TX",
              neighborhood: null,
              propertyType: "SINGLE_FAMILY",
              beds: 3,
              baths: 2,
              sqft: 1_600,
              lotSqft: null,
              units: null,
              yearBuilt: 1985,
              condition: "FAIR",
              repairEstimate: null,
              createdAt: at,
              updatedAt: at,
            },
            photos: [],
            myOffer: null,
            myOwnTerms: null,
            myDeal: null,
            matchedAt: at,
          }),
        },
      }),
    );
    const res = await request(app)
      .get("/api/v1/investor/packages/p1")
      .set("Authorization", "Bearer investor")
      .expect(200);
    expect(res.body).toMatchObject({ id: "p1", city: "Austin", zip: "78704" });
    expect(JSON.stringify(res.body)).not.toMatch(/Elm|streetLine/);
  });
});
