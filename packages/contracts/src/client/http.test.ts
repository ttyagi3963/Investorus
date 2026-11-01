// Guards the client's promises to the screens (T264): every failed call throws an ApiError with
// the status, even when the answer is not JSON (the BFF passes a plain-text 502 through unchanged);
// and every POST and PATCH carries an Idempotency-Key, a fresh one unless the caller passes its own,
// so a retry of one action reuses its key (T285).
import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./http.js";

describe("createApiClient", () => {
  it("throws an ApiError with the status when a failed answer is not JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const api = createApiClient({ baseUrl: "/bff", fetch });

    const error = await api.request("POST", "/session", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("sends a fresh Idempotency-Key with each POST and PATCH, or the one it is given, and none with a GET", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("{}", { status: 200 }));
    const api = createApiClient({ baseUrl: "/bff", fetch });
    const keyOf = (call: number) =>
      new Headers((fetch.mock.calls[call] as [string, RequestInit])[1].headers).get(
        "Idempotency-Key",
      );

    await api.request("POST", "/listing-packages", {});
    await api.request("PATCH", "/listing-packages/p1", {});
    await api.request("POST", "/listing-packages", {}, { idempotencyKey: "same-action" });
    await api.request("GET", "/listing-packages");

    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
    expect(keyOf(1)).toMatch(/^[0-9a-f]{32}$/);
    expect(keyOf(1)).not.toBe(keyOf(0));
    expect(keyOf(2)).toBe("same-action");
    expect(keyOf(3)).toBeNull();
  });
});
