// Guards the app's outer behavior (T232, T255): health answers without a session, the framework
// header is hidden, and an unknown route is a 404 only for a signed-in caller (others get 401, so
// they learn nothing about the routes).
import { UnauthenticatedError } from "@clever/contracts/common";
import { pino } from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { AppContainer } from "./container.js";

const unused = () => Promise.reject(new Error("not used in this test"));
const container: AppContainer = {
  auth: {
    signIn: unused,
    me: unused,
    verify: async (token) => {
      if (token !== "good") throw new UnauthenticatedError("Sign in again");
      return { userId: "user-a", role: "AGENT", agentId: "agent-a" };
    },
  },
  packages: { create: unused, get: unused, list: unused, update: unused },
  photos: { requestUpload: unused, attach: unused, remove: unused },
  presentPackage: unused,
  checkDatabase: async () => {},
  logger: pino({ level: "silent" }),
  reporter: { report: () => {} },
  dispose: async () => {},
};

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
