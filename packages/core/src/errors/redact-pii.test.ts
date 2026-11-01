// Guards the logging privacy rule (constitution XII): seller PII, passwords, and session tokens
// are replaced before anything is logged, however deep they sit in the value.
import { describe, expect, it } from "vitest";
import { redactPii } from "./redact-pii.js";

describe("redactPii", () => {
  it("replaces every sensitive key, at any depth, and leaves the rest", () => {
    const value = {
      packageId: "pkg-1",
      seller: { fullName: "Maria Lopez", email: "maria@example.com", phone: "+15551234567" },
      properties: [{ streetLine: "12 Elm St", zip: "78701" }],
      headers: { Authorization: "Bearer abc", cookie: "session=abc" },
      password: "demo1234",
    };
    expect(redactPii(value)).toEqual({
      packageId: "pkg-1",
      seller: { fullName: "[REDACTED]", email: "[REDACTED]", phone: "[REDACTED]" },
      properties: [{ streetLine: "[REDACTED]", zip: "78701" }],
      headers: { Authorization: "[REDACTED]", cookie: "[REDACTED]" },
      password: "[REDACTED]",
    });
  });
});
