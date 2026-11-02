// Guards how a sandbox answer is sorted for the dispatcher (T339; contracts/events.md): each send
// carries its Idempotency-Key and the internal token; the CRM's 409 is STALE, not a failure; a
// garbled body or a 429 is temporary and retried; any other 4xx is a refusal that is not retried.
import { describe, expect, it, vi } from "vitest";
import { DeliveryRejectedError } from "../errors/DeliveryRejectedError.js";
import { InfrastructureError } from "../errors/InfrastructureError.js";
import { SandboxCrmProviderImpl } from "./crm/SandboxCrmProviderImpl.js";
import { SandboxMessagingProviderImpl } from "./messaging/SandboxMessagingProviderImpl.js";

const RECORD = {
  packageId: "package-1",
  status: "ACCEPTING_OFFERS",
  round: 1,
  offerCount: 0,
  acceptedPrice: null,
  sellerContact: { fullName: "Pat Seller", email: null, phone: "+15125550199" },
  occurredAt: new Date("2026-11-04T12:00:00Z"),
  sequence: 7,
};

const answering = (status: number, body: string) =>
  vi.fn(
    async () => new Response(body, { status, headers: { "Content-Type": "application/json" } }),
  );

const crmWith = (fetch: typeof globalThis.fetch) =>
  new SandboxCrmProviderImpl({ internalUrl: "http://sandbox", internalToken: "token", fetch });

describe("sandbox deliveries", () => {
  it("sends the key and token, and takes the CRM's 409 as STALE", async () => {
    const fetch = answering(409, JSON.stringify({ code: "STALE" }));

    await expect(crmWith(fetch).upsertListing(RECORD, "delivery-1")).resolves.toBe("STALE");
    expect(fetch).toHaveBeenCalledWith(
      "http://sandbox/crm/listings/package-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "delivery-1",
          "x-sandbox-token": "token",
        }),
      }),
    );
  });

  it("retries a garbled answer or a 429, and refuses on any other 4xx", async () => {
    const messaging = (fetch: typeof globalThis.fetch) =>
      new SandboxMessagingProviderImpl({
        internalUrl: "http://sandbox",
        internalToken: "t",
        fetch,
      });
    const email = { to: "i@example.test", subject: "Hi", body: "Hello" };

    await expect(
      messaging(answering(200, '{"id": "msg')).sendEmail(email, "d-1"),
    ).rejects.toBeInstanceOf(InfrastructureError);
    await expect(messaging(answering(429, "{}")).sendEmail(email, "d-2")).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    await expect(messaging(answering(400, "{}")).sendEmail(email, "d-3")).rejects.toBeInstanceOf(
      DeliveryRejectedError,
    );
  });
});
