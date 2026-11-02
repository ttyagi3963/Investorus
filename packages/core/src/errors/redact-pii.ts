// Replaces seller PII, passwords, and session tokens in any value before it is logged or kept in an
// audit entry or a delivery's failure (constitution XII), however deep they sit.

/** Keys whose values are personal or secret, compared in lower case (the data model's names). */
const SENSITIVE_KEYS = new Set([
  "fullname",
  "sellername",
  "contactname",
  "email",
  "phone",
  "streetline",
  "sellercontact",
  "note",
  "fellthroughreason",
  "password",
  "passwordhash",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
]);

/**
 * Redacts a value for a log line. An Error keeps its name, its scrubbed message and stack, and its
 * cause (an Error's own fields are not enumerable, so they would otherwise vanish). A value met
 * again inside itself becomes "[Circular]", so a self-referring context cannot overflow the stack.
 */
export function redactPii(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  // A Date or Decimal is redacted as it is written out (its JSON), not as its inner fields.
  if ("toJSON" in value && typeof value.toJSON === "function") {
    return redact(value.toJSON(), ancestors);
  }
  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redact(item, ancestors));
    const fields = Object.entries(value).map(([key, v]): [string, unknown] => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(v, ancestors),
    ]);
    if (value instanceof Error) {
      const { name, message, stack, cause } = value;
      fields.push(
        ["name", name],
        ["message", scrubPiiText(message)],
        ["stack", stack === undefined ? undefined : scrubPiiText(stack)],
        ["cause", typeof cause === "string" ? scrubPiiText(cause) : redact(cause, ancestors)],
      );
    }
    return Object.fromEntries(fields);
  } finally {
    ancestors.delete(value);
  }
}

/**
 * A phone number in the forms the app takes: E.164 (`+15551234567`), or a US number with or
 * without separators (`(512) 555-0199`, `512-555-0199`, `+1 512 555 0199`). Digits joined to a
 * letter, a digit, or a plus sign are not one, so dates, times, IDs, and prices stay readable.
 */
const PHONE =
  /(?<![\w+])(?:\+[1-9]\d{6,14}|(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4})(?!\w)/g;

/**
 * Scrubs the free text of an error (its message, stack, or cause) before it is logged: an error
 * often quotes the value that broke it, such as Postgres's `Key (email)=(...)`. Emails, phone
 * numbers, and quoted key values are replaced; the rest of the text stays readable.
 */
export function scrubPiiText(text: string): string {
  return text
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=([REDACTED])")
    .replace(/[^\s@"'()<>]+@[^\s@"'()<>]+\.[a-z]{2,}/gi, "[EMAIL]")
    .replace(PHONE, "[PHONE]");
}
