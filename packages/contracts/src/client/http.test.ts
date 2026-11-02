// Guards the client's promises to the screens (T264): every failed call throws an ApiError with
// the status, even when the answer is not JSON (the BFF passes a plain-text 502 through unchanged);
// and every POST, PUT, and PATCH carries an Idempotency-Key that a retry of the same request
// reuses until the api has settled it, so a retried or double-clicked action applies once (T381).
import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./http.js";

const apiError = (status: number, code: string) =>
  new Response(JSON.stringify({ error: "refused", code }), { status });

function client() {
  const fetch = vi.fn();
  const api = createApiClient({ baseUrl: "/bff", fetch });
  const keyOf = (call: number) =>
    new Headers((fetch.mock.calls[call] as [string, RequestInit])[1].headers).get(
      "Idempotency-Key",
    );
  return { fetch, api, keyOf };
}

describe("createApiClient", () => {
  it("throws an ApiError with the status when a failed answer is not JSON", async () => {
    const { fetch, api } = client();
    fetch.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    const error = await api.request("POST", "/session", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
  });

  it("keeps a request's key until the api settles it, and starts a new one for a changed body", async () => {
    const { fetch, api, keyOf } = client();
    fetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(apiError(503, "INFRASTRUCTURE"))
      .mockResolvedValueOnce(apiError(409, "IDEMPOTENCY_IN_PROGRESS"))
      .mockResolvedValueOnce(apiError(409, "IDEMPOTENCY_ALREADY_APPLIED"))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(apiError(409, "CONFLICT"))
      .mockResolvedValueOnce(apiError(400, "VALIDATION_FAILED"))
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const draft = () =>
      api.request("POST", "/listing-packages", { street: "1 Main" }).catch(() => {});

    for (let i = 0; i < 5; i++) await draft(); // lost, 503, in progress, applied, then created
    await draft(); // a new action after the success: refused
    await draft(); // and another after that refusal
    await api.request("POST", "/listing-packages", { street: "2 Main" });
    await api.request("GET", "/listing-packages");

    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
    expect([1, 2, 3, 4].map(keyOf)).toEqual(Array(4).fill(keyOf(0)));
    expect(new Set([4, 5, 6, 7].map(keyOf)).size).toBe(4);
    expect(keyOf(8)).toBeNull();
  });

  it("sends a request once when it is sent again before its answer arrives", async () => {
    const { fetch, api } = client();
    let answer: (res: Response) => void = () => {};
    fetch.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));

    const first = api.request("POST", "/offers/o1/withdrawal", { version: 3 });
    const second = api.request("POST", "/offers/o1/withdrawal", { version: 3 });
    answer(new Response('{"id":"o1"}', { status: 200 }));

    expect(await second).toEqual(await first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
