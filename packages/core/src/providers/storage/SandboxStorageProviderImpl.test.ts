// Guards the storage provider's rules (contracts/providers.md, T251, T384): an upload link is signed
// over the key, type, exact size, and expiry, so none can be changed; a storage failure, a garbled
// answer, or an object larger than the caller allows surfaces as an InfrastructureError.
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

  it("treats a 200 that does not name the object (garbage mode) as an outage, not as metadata", async () => {
    const garbled = () =>
      new Response('{"result": "APPL', {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    const storage = new SandboxStorageProviderImpl(options(vi.fn(async () => garbled())));
    await expect(storage.stat("imports/a.csv")).rejects.toMatchObject({
      name: "InfrastructureError",
      status: 502,
    });
    await expect(storage.read("imports/a.csv", 1_024)).rejects.toMatchObject({ status: 502 });
  });

  it("refuses an object larger than the caller allows without reading all of it", async () => {
    // A 1 MB body with no declared length, sent 1 KB at a time; the limit is 4 KB.
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        if (sent >= 1_024 * 1_024) return controller.close();
        sent += 1_024;
        controller.enqueue(new Uint8Array(1_024));
      },
    });
    const res = new Response(body, {
      headers: { "x-object-key": encodeURIComponent("imports/a.csv") },
    });
    const storage = new SandboxStorageProviderImpl(options(vi.fn().mockResolvedValue(res)));
    await expect(storage.read("imports/a.csv", 4_096)).rejects.toBeInstanceOf(InfrastructureError);
    expect(sent).toBeLessThan(64 * 1_024);
  });
});
