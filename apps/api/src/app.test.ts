import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("api shell (T232)", () => {
  it("answers the health check", async () => {
    const res = await request(createApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes and hides the framework header", async () => {
    const res = await request(createApp()).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
