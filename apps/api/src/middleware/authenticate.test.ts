// Guards the api's front door (T253): every route but sign-in and health needs a valid session
// token, the actor the token names reaches the route, and anything else gets a 401. A public path
// stays public however the router would match it (T392). The token rules themselves (expiry,
// signature, algorithm) are tested with AuthService in core.
import { UnauthenticatedError } from "@clever/contracts/common";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate } from "./authenticate.js";
import { errorTranslator } from "./errors.js";

const actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" } as const;
const auth = {
  verify: async (token: string) => {
    if (token !== "good-token") throw new UnauthenticatedError("Sign in again");
    return actor;
  },
};

const app = express();
app.use(authenticate(auth));
app.post("/api/v1/sessions", (_req, res) => void res.status(201).json({ public: true }));
app.get("/api/v1/health", (_req, res) => void res.json({ public: true }));
app.get("/api/v1/me", (_req, res) => void res.json(res.locals.actor));
app.use(errorTranslator({ report: () => {} }));

describe("authenticate", () => {
  it("lets sign-in and health through without a token", async () => {
    await request(app).post("/api/v1/sessions").expect(201);
    await request(app).get("/api/v1/health").expect(200);
  });

  it("agrees with the router on a trailing slash or other letter case, opening no other route (T392)", async () => {
    await request(app).get("/api/v1/health/").expect(200);
    await request(app).get("/API/V1/Health").expect(200);
    await request(app).get("/api/v1/me/").expect(401);
    await request(app).get("/api/v1/health/me").expect(401);
  });

  it("refuses a request with no token, a malformed header, or a bad token", async () => {
    await request(app).get("/api/v1/me").expect(401);
    await request(app).get("/api/v1/me").set("Authorization", "good-token").expect(401);
    await request(app).get("/api/v1/me").set("Authorization", "Bearer bad-token").expect(401);
  });

  it("gives the route the actor the token names", async () => {
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer good-token")
      .expect(200);
    expect(res.body).toEqual(actor);
  });
});
