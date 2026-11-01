// Guards the storage provider's rules (contracts/providers.md, T251): an upload link is signed over
// the key, type, exact size, and expiry, so none can be changed; and a storage failure surfaces as
// an InfrastructureError, never a raw network error.
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { SandboxStorageProviderImpl } from "./SandboxStorageProviderImpl.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const options = (fetch: typeof globalThis.fetch) => ({
  publicUrl: "http://localhost:4100",
  internalUrl: "http://sandbox:4100",
  signingKey: "signing-key",
  internalToken: "internal-token",
  clock: { now: () => NOW },
  fetch,
});

describe("SandboxStorageProviderImpl", () => {
  it("signs an upload link over the key, the content type, the exact size, and the expiry", async () => {
    const storage = new SandboxStorageProviderImpl(options(vi.fn()));
    const upload = await storage.createUpload("packages/p1/a.jpg", "image/jpeg", 2_000);
    const url = new URL(upload.url);
    const exp = url.searchParams.get("exp");
    const expected = createHmac("sha256", "signing-key")
      .update(`PUT\npackages/p1/a.jpg\nimage/jpeg\n2000\n${exp}`)
      .digest("hex");
    expect(url.origin).toBe("http://localhost:4100");
    expect(url.searchParams.get("size")).toBe("2000");
    expect(url.searchParams.get("sig")).toBe(expected);
    expect(upload).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg" } });
    expect(new Date(upload.expiresAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("turns a storage outage or a timeout into an InfrastructureError", async () => {
    const down = new SandboxStorageProviderImpl(
      options(vi.fn().mockResolvedValue(new Response(null, { status: 503 }))),
    );
    await expect(down.stat("packages/p1/a.jpg")).rejects.toBeInstanceOf(InfrastructureError);
    const hung = new SandboxStorageProviderImpl(
      options(vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))),
    );
    await expect(hung.stat("packages/p1/a.jpg")).rejects.toBeInstanceOf(InfrastructureError);
  });
});
