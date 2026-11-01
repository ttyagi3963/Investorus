// @vitest-environment node
// Guards the agent pages' door (T266): without a session cookie a visitor is sent to /login before
// any agent page renders; with one, the request goes on (the api still checks the token itself).
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("sends a visitor with no session to /login, and lets a signed-in one through", () => {
    const anonymous = proxy(new NextRequest("http://localhost:3000/agent/packages/new"));
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get("location")).toBe("http://localhost:3000/login");

    const signedIn = proxy(
      new NextRequest("http://localhost:3000/agent", { headers: { cookie: "session=tok123" } }),
    );
    expect(signedIn.headers.get("location")).toBeNull();
  });
});
