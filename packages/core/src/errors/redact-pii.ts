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
