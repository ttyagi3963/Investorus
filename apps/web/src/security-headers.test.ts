// @vitest-environment node
// Guards the web app's response headers (T362): no page can be framed by another site, the browser
// never guesses a content type, and a link out sends no path.
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

describe("SECURITY_HEADERS", () => {
  it("forbid framing and type sniffing, and keep paths out of referrers", () => {
    const header = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;
    expect(header("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
