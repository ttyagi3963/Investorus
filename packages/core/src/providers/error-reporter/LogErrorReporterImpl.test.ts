// Guards the error-log privacy rule (constitution XII, XX.1): an unexpected error often quotes the
// value that broke it, so its message, stack, and cause are scrubbed before they reach the log.
import { describe, expect, it, vi } from "vitest";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { LogErrorReporterImpl } from "./LogErrorReporterImpl.js";

describe("LogErrorReporterImpl", () => {
  it("keeps emails, phone numbers, and quoted key values out of the log line", () => {
    const logger = { error: vi.fn() };
    const cause = new Error("connect failed for maria@example.com");
    const err = new InfrastructureError(
      "duplicate key: Key (email)=(avery@example.com) already exists; caller +15551234567",
      503,
      cause,
    );
    new LogErrorReporterImpl(logger).report(err, { seller: { phone: "+15551234567" } });
    const logged = JSON.stringify(logger.error.mock.calls);
    expect(logged).not.toMatch(/avery@example\.com|maria@example\.com|5551234567/);
    expect(logged).toContain("InfrastructureError");
  });
});
