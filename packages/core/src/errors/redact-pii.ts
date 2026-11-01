// Replaces seller PII, passwords, and session tokens in any value before it is logged
// (constitution XII), so a log line never carries them, however deep they sit.

const SENSITIVE_KEYS = new Set([
  "fullname",
  "sellername",
  "email",
  "phone",
  "streetline",
  "sellercontact",
  "password",
  "authorization",
  "cookie",
]);

export function redactPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPii);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redactPii(v),
      ]),
    );
  }
  return value;
}

/**
 * Scrubs the free text of an error (its message, stack, or cause) before it is logged: an error
 * often quotes the value that broke it, such as Postgres's `Key (email)=(...)`. Emails, phone
 * numbers, and quoted key values are replaced; the rest of the text stays readable.
 */
export function scrubPiiText(text: string): string {
  return text
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=([REDACTED])")
    .replace(/[^\s@"'()<>]+@[^\s@"'()<>]+\.[a-z]{2,}/gi, "[EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[PHONE]");
}
