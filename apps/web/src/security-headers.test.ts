// @vitest-environment node
// Guards the web app's response headers (T362, T389, T402): on every path Next serves, no page can
// be framed by another site, the browser never guesses a content type, and a link out sends no
// path; a page loads only from this site and the photo storage, and HSTS is sent only over HTTPS.
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { pageSecurityHeaders } from "./security-headers";

describe("next.config headers", () => {
  it("forbid framing and type sniffing, and keep paths out of referrers, on every path", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const everyPath = rules.find((rule) => rule.source === "/:path*");
    const header = (key: string) => everyPath?.headers.find((h) => h.key === key)?.value;
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("pageSecurityHeaders", () => {
  it("load from this site and the photo storage only, and send HSTS only over HTTPS", () => {
    const storage = "http://localhost:4100";
    const headers = pageSecurityHeaders({ storageOrigin: storage, https: false, dev: false });
    const csp = Object.fromEntries(
      headers["Content-Security-Policy"]!.split("; ").map((d) => [d.split(" ")[0], d]),
    );
    expect(csp["default-src"]).toBe("default-src 'self'");
    expect(csp["img-src"]).toBe(`img-src 'self' ${storage}`);
    expect(csp["connect-src"]).toBe(`connect-src 'self' ${storage}`);
    expect(csp["frame-ancestors"]).toBe("frame-ancestors 'none'");
    expect(csp["script-src"]).not.toContain("unsafe-eval");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();

    const https = pageSecurityHeaders({ storageOrigin: storage, https: true, dev: false });
    expect(https["Strict-Transport-Security"]).toMatch(/^max-age=\d+/);
  });
});
