import { tmpdir } from "node:os";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("sandbox shell (T232)", () => {
  it("serves the inspection page placeholder at /", async () => {
    const app = createApp({
      storageDir: tmpdir(),
      signingKey: "signing-key",
      internalToken: "internal-token",
      webOrigin: "http://localhost:3000",
      now: () => new Date(),
    });
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toContain("Sandbox");
  });
});
