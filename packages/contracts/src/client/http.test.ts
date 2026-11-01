// Guards the client's one promise to the screens (T264): every failed call throws an ApiError with
// the status, even when the answer is not JSON (the BFF passes a plain-text 502 through unchanged).
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
});
