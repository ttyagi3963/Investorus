// @vitest-environment node
// Guards the signed-in areas' door (T266, T358, T374): without a session cookie a visitor is sent to
// /login before any page renders; so is one whose cookie cannot be read, names no known role, or has
// expired, and that cookie is cleared; a signed-in user who opens another role's pages is sent to
// their own role's home; with a matching role, the request goes on (the api still checks the token).
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

beforeAll(() => {
  vi.stubEnv("API_URL", "http://api:4000");
  vi.stubEnv("DEFAULT_BRAND_ID", "clever");
  vi.stubEnv("PUBLIC_SANDBOX_URL", "http://localhost:4100");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
/** A token with the given claims; the proxy reads them only to choose a page, never to trust them. */
const tokenFor = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
const open = (path: string, token?: string) =>
  proxy(
    new NextRequest(`http://localhost:3000${path}`, {
      headers: token ? { cookie: `session=${token}` } : {},
    }),
  );

describe("proxy", () => {
  it("sends a visitor with no session to /login, and a user on another role's pages home", () => {
    expect(open("/agent/packages/new").headers.get("location")).toBe("http://localhost:3000/login");

    const investor = tokenFor({ userId: "u1", role: "INVESTOR", exp: inAnHour() });
    expect(open("/agent/packages", investor).headers.get("location")).toBe(
      "http://localhost:3000/investor",
    );
    expect(open("/investor/buy-boxes", investor).headers.get("location")).toBeNull();
  });

  it("sends an unreadable, unknown-role, or expired session to /login and clears the cookie", () => {
    for (const token of [
      "corrupt",
      tokenFor({ userId: "u1", role: "ROOT", exp: inAnHour() }),
      tokenFor({ userId: "u1", role: "AGENT", exp: Math.floor(Date.now() / 1000) - 1 }),
      tokenFor({ userId: "u1", role: "AGENT" }),
    ]) {
      const res = open("/agent", token);
      expect(res.headers.get("location")).toBe("http://localhost:3000/login");
      expect(res.headers.get("set-cookie")).toMatch(/^session=; Path=\/; HttpOnly; .*Max-Age=0/);
    }
  });
});
