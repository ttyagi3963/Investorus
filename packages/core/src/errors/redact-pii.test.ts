// Guards the logging privacy rule (constitution XII): seller PII, passwords, and session tokens
// are replaced before anything is logged, however deep they sit in the value.
import { describe, expect, it } from "vitest";
import { redactPii, scrubPiiText } from "./redact-pii.js";

describe("redactPii", () => {
  it("replaces every sensitive key, at any depth, and leaves the rest", () => {
    const value = {
      packageId: "pkg-1",
      seller: { fullName: "Maria Lopez", email: "maria@example.com", phone: "+15551234567" },
      properties: [{ streetLine: "12 Elm St", zip: "78701" }],
      headers: { Authorization: "Bearer abc", cookie: "session=abc", "set-cookie": "session=abc" },
      password: "demo1234",
      token: "abc",
      decision: { note: "Seller Maria wants to close fast" },
      deal: { fellThroughReason: "Maria's lender pulled out" },
      investor: { contactName: "Sam Rivera" },
    };
    expect(redactPii(value)).toEqual({
      packageId: "pkg-1",
      seller: { fullName: "[REDACTED]", email: "[REDACTED]", phone: "[REDACTED]" },
      properties: [{ streetLine: "[REDACTED]", zip: "78701" }],
      headers: { Authorization: "[REDACTED]", cookie: "[REDACTED]", "set-cookie": "[REDACTED]" },
      password: "[REDACTED]",
      token: "[REDACTED]",
      decision: { note: "[REDACTED]" },
      deal: { fellThroughReason: "[REDACTED]" },
      investor: { contactName: "[REDACTED]" },
    });
  });

  it("redacts a value that refers to itself without overflowing the stack", () => {
    const context: Record<string, unknown> = { packageId: "pkg-1", email: "maria@example.com" };
    context.self = context;
    expect(redactPii(context)).toEqual({
      packageId: "pkg-1",
      email: "[REDACTED]",
      self: "[Circular]",
    });
  });

  it("keeps an error's message and cause, scrubbed", () => {
    const err = new Error("send to maria@example.com failed", {
      cause: new Error("caller +15551234567 hung up"),
    });
    const redacted = JSON.stringify(redactPii({ err }));
    expect(redacted).toContain("send to [EMAIL] failed");
    expect(redacted).toContain("caller [PHONE] hung up");
    expect(redacted).not.toMatch(/maria@example\.com|5551234567/);
  });
});

describe("scrubPiiText", () => {
  it("scrubs emails and phone numbers in each accepted format, and keeps dates and times", () => {
    expect(
      scrubPiiText(
        "maria@example.com, +15551234567, (512) 555-0199, 512-555-0199 closing 2026-11-01 at 2026-11-01T10:00:00.000Z",
      ),
    ).toBe("[EMAIL], [PHONE], [PHONE], [PHONE] closing 2026-11-01 at 2026-11-01T10:00:00.000Z");
  });
});
