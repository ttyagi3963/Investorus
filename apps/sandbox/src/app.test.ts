// Guards the sandbox's error log (T392): a failed request is logged without the error's message,
// which can quote what was being stored, such as a seller's contact from a CRM update. And a storage
// outage's answer carries a listed web origin's CORS headers, so its browser can read it (T414).
import { tmpdir } from "node:os";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { SandboxStore } from "./store.js";

const TOKEN = "test-internal-token";
const WEB = "http://localhost:3000";

const appWith = (store: Partial<SandboxStore>) =>
  createApp({
    storageDir: tmpdir(),
    signingKey: "test-signing-key",
    internalToken: TOKEN,
    webOrigins: [WEB],
    now: () => new Date(),
    store: store as SandboxStore,
    slowDelayMs: 0,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sandbox error log", () => {
  it("logs a failed CRM update without the seller's contact the error quotes", async () => {
    const app = appWith({
      getModes: async () => ({ crm: "up", messaging: "up", storage: "up" }),
      applyCrmUpdate: async () => {
        throw new Error('invalid input syntax for type json: "sam@example.com"');
      },
    });
    const logged: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      logged.push(String(chunk));
      return true;
    });

    await request(app)
      .put("/crm/listings/pkg-1")
      .set("x-sandbox-token", TOKEN)
      .set("Idempotency-Key", "delivery-1")
      .send({
        status: "ACCEPTING_OFFERS",
        round: 1,
        offerCount: 0,
        acceptedPrice: null,
        sellerContact: { fullName: "Sam Seller", email: "sam@example.com", phone: null },
        occurredAt: "2026-11-01T10:00:00.000Z",
        sequence: 1,
      })
      .expect(500);
    expect(logged.join("")).toContain("PUT /crm/listings/pkg-1");
    expect(logged.join("")).not.toContain("sam@example.com");
  });
});

describe("sandbox storage outage", () => {
  it("answers a listed web origin's upload with CORS headers, and no other origin's", async () => {
    const app = appWith({
      getModes: async () => ({ crm: "up", messaging: "up", storage: "down" }),
    });
    const preflight = await request(app)
      .options("/storage/objects/k")
      .set("Origin", WEB)
      .set("Access-Control-Request-Method", "PUT")
      .expect(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(WEB);
    const upload = await request(app).put("/storage/objects/k").set("Origin", WEB).expect(503);
    expect(upload.headers["access-control-allow-origin"]).toBe(WEB);
    const other = await request(app)
      .put("/storage/objects/k")
      .set("Origin", "https://evil.example")
      .expect(503);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
