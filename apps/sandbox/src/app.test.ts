// Guards the sandbox's error log (T392): a failed request is logged without the error's message,
// which can quote what was being stored, such as a seller's contact from a CRM update.
import { tmpdir } from "node:os";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { SandboxStore } from "./store.js";

const TOKEN = "test-internal-token";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sandbox error log", () => {
  it("logs a failed CRM update without the seller's contact the error quotes", async () => {
    const store = {
      getModes: async () => ({ crm: "up", messaging: "up", storage: "up" }),
      applyCrmUpdate: async () => {
        throw new Error('invalid input syntax for type json: "sam@example.com"');
      },
    } as unknown as SandboxStore;
    const app = createApp({
      storageDir: tmpdir(),
      signingKey: "test-signing-key",
      internalToken: TOKEN,
      webOrigins: [],
      now: () => new Date(),
      store,
      slowDelayMs: 0,
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
