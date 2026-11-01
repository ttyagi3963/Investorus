// @vitest-environment node
// Guards the BFF's rules (T262, research R12): a state-changing request from another origin is
// refused before it reaches the api (CSRF); the session token travels only in an HTTP-only cookie
// and is forwarded as a bearer token; the api's answer comes back unchanged; and every call to the
// api carries one trace ID, the caller's when its `traceparent` is valid (T283), and the caller's
// Idempotency-Key (T285).
import { describe, expect, it, vi } from "vitest";
import { forwardToApi } from "./proxy";
import { signIn, signOut } from "./session";

const API = "http://api:4000";
const SITE = "http://localhost:3000";
// What the Next server in the container sees: it listens on 0.0.0.0, so the request URL names that
// address, and only the Host header names the site the browser opened.
const fromSite = (path: string, init: RequestInit & { headers?: Record<string, string> }) =>
  new Request(`http://0.0.0.0:3000${path}`, {
    ...init,
    headers: { Host: "localhost:3000", Origin: SITE, ...init.headers },
  });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("forwardToApi", () => {
  it("refuses a state-changing request whose Origin is not this site, without calling the api", async () => {
    const fetch = vi.fn();
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const res = await forwardToApi(
        new Request(`${SITE}/bff/listing-packages`, {
          method,
          headers: { Origin: "https://evil.example" },
        }),
        ["listing-packages"],
        { apiUrl: API, fetch },
      );
      expect(res.status).toBe(403);
    }
    const noOrigin = await forwardToApi(
      new Request(`${SITE}/bff/listing-packages`, { method: "POST" }),
      ["listing-packages"],
      {
        apiUrl: API,
        fetch,
      },
    );
    expect(noOrigin.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a GET with the cookie's token as a bearer token, and returns the api's answer unchanged", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ error: "Package not found", code: "NOT_FOUND" }, 404));
    const res = await forwardToApi(
      new Request(`${SITE}/bff/listing-packages/p1?x=1`, {
        headers: { Cookie: "other=1; session=tok123" },
      }),
      ["listing-packages", "p1"],
      { apiUrl: API, fetch },
    );
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/v1/listing-packages/p1?x=1`);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok123");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Package not found", code: "NOT_FOUND" });
  });
});

describe("forwarding", () => {
  it("passes the caller's Idempotency-Key to the api", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ id: "p1" }, 201));
    await forwardToApi(
      fromSite("/bff/listing-packages", {
        method: "POST",
        headers: { "Idempotency-Key": "action-1", "Content-Type": "application/json" },
        body: "{}",
      }),
      ["listing-packages"],
      { apiUrl: API, fetch },
    );
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("action-1");
  });
});

describe("tracing", () => {
  it("forwards the caller's trace ID as a fresh traceparent, and creates one when it is missing or malformed", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const fetch = vi
      .fn()
      .mockImplementation(async () => json({ error: "Package not found", code: "NOT_FOUND" }, 404));
    const send = (traceparent?: string) =>
      forwardToApi(
        new Request(`${SITE}/bff/listing-packages`, {
          headers: traceparent ? { traceparent } : {},
        }),
        ["listing-packages"],
        { apiUrl: API, fetch },
      );
    const sent = () =>
      new Headers((fetch.mock.lastCall as [string, RequestInit])[1].headers).get("traceparent");

    await send(`00-${traceId}-00f067aa0ba902b7-01`);
    expect(sent()).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
    for (const missingOrBad of [
      undefined,
      "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
    ]) {
      await send(missingOrBad);
      expect(sent()).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(sent()).not.toContain("00000000000000000000000000000000");
    }
  });
});

describe("session", () => {
  it("keeps the token in an HTTP-only cookie and returns only the user", async () => {
    const user = { id: "u1", email: "avery@example.com", role: "AGENT", displayName: "Avery" };
    const fetch = vi.fn().mockResolvedValue(json({ token: "tok123", user }, 201));
    const res = await signIn(
      fromSite("/bff/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "avery@example.com", password: "demo1234" }),
      }),
      { apiUrl: API, secureCookie: true, fetch },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ user });
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^session=tok123;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Secure/);
  });

  it("sets no cookie when the api refuses the sign-in, and passes its answer back unchanged", async () => {
    const refusal = { error: "Invalid email or password", code: "VALIDATION_FAILED" };
    const fetch = vi.fn().mockResolvedValue(json(refusal, 400));
    const res = await signIn(fromSite("/bff/session", { method: "POST", body: "{}" }), {
      apiUrl: API,
      secureCookie: true,
      fetch,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(refusal);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("clears the cookie on sign out, and refuses a sign-in from another origin", async () => {
    const out = await signOut(fromSite("/bff/session", { method: "DELETE" }));
    expect(out.headers.get("Set-Cookie")).toMatch(/^session=; .*Max-Age=0/);
    const fetch = vi.fn();
    const evil = await signIn(
      new Request(`${SITE}/bff/session`, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: "{}",
      }),
      { apiUrl: API, secureCookie: true, fetch },
    );
    expect(evil.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
