// Guards the token privacy rule (constitution XII): the session token and cookie in a request's
// headers never reach the log, even when a whole request is logged; and every line logged inside a
// request carries its trace ID, from any layer, with no code passing it along (T283).
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";
import { runWithTrace } from "./trace-context.js";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, destination };
}

describe("createLogger", () => {
  it("redacts the authorization and cookie headers", () => {
    const { lines, destination } = capture();
    createLogger("test", { destination }).info({
      req: { headers: { authorization: "Bearer secret-token", cookie: "session=secret-cookie" } },
    });
    expect(lines.join("")).not.toMatch(/secret-token|secret-cookie/);
    expect(lines.join("")).toContain("[REDACTED]");
  });

  it("adds the trace ID to every line logged inside a trace, even after an await", async () => {
    const { lines, destination } = capture();
    const log = createLogger("test", { destination });
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    await runWithTrace(traceId, async () => {
      await Promise.resolve();
      log.info("inside");
    });
    log.info("outside");
    const [inside, outside] = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(inside).toMatchObject({ msg: "inside", trace_id: traceId });
    expect(outside).not.toHaveProperty("trace_id");
  });
});
