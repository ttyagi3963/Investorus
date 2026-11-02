// Guards the theme editor's save from the server (T395): the call to the api carries the request's
// trace ID and the visitor's session, and a malformed save is a field error, never a crash.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TRACE = "0af7651916cd43dd8448eb211c80319c";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "session" ? { value: "jwt" } : undefined),
  }),
  headers: async () => new Headers({ traceparent: `00-${TRACE}-b7ad6b7169203331-01` }),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));

const { saveBrandTokens } = await import("./actions");

beforeAll(() => {
  vi.stubEnv("API_URL", "http://api:4000");
  vi.stubEnv("DEFAULT_BRAND_ID", "clever");
  vi.stubEnv("PUBLIC_SANDBOX_URL", "http://localhost:4100");
  vi.stubEnv("STORAGE_PROVIDER", "sandbox");
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("saveBrandTokens", () => {
  it("calls the api with the request's trace ID and the visitor's session", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ brandId: "clever" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    await saveBrandTokens({ brandId: "clever", tokens: {}, tokenVersion: 1 });
    const sent = new Headers(fetch.mock.calls[0]![1]!.headers);
    expect(sent.get("traceparent")).toContain(TRACE);
    expect(sent.get("authorization")).toBe("Bearer jwt");
  });

  it("answers a malformed save with a field error, without calling the api", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const result = await saveBrandTokens({ brandId: "clever", tokens: {}, tokenVersion: "one" });
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      body: { code: "VALIDATION_FAILED", details: { fields: [{ field: "tokenVersion" }] } },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
