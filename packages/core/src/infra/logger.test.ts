// Guards the token privacy rule (constitution XII): the session token and cookie in a request's
// headers never reach the log, even when a whole request is logged.
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("redacts the authorization and cookie headers", () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    createLogger("test", { destination }).info({
      req: { headers: { authorization: "Bearer secret-token", cookie: "session=secret-cookie" } },
    });
    expect(lines.join("")).not.toMatch(/secret-token|secret-cookie/);
    expect(lines.join("")).toContain("[REDACTED]");
  });
});
