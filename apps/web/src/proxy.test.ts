// @vitest-environment node
// Guards the signed-in areas' door (T266, T358): without a session cookie a visitor is sent to /login
// before any page renders; a signed-in user who opens another role's pages is sent to their own
// role's home; with a matching role, the request goes on (the api still checks the token itself).
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

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

    const investor = tokenFor({ userId: "u1", role: "INVESTOR", investorId: "i1" });
    expect(open("/agent/packages", investor).headers.get("location")).toBe(
      "http://localhost:3000/investor",
    );
    expect(open("/investor/buy-boxes", investor).headers.get("location")).toBeNull();
  });
});
