// Guards the client's paths (T385 follow-up): an ID is always one encoded path segment, so a value
// such as "../x" can never point a request at another route.
import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./http.js";
import { buyBoxesClient, investorImportsClient } from "./modules.js";

describe("client paths", () => {
  it("encodes every ID into a single path segment", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const api = createApiClient({ baseUrl: "/bff", fetch });
    await investorImportsClient(api).get("../users");
    await buyBoxesClient(api).get("a/b");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/bff/ops/investor-imports/..%2Fusers",
      "/bff/investor/buy-boxes/a%2Fb",
    ]);
  });
});
