// W3C Trace Context (T283): the `traceparent` header that carries one trace ID from the BFF to the
// api, the same header OpenTelemetry uses, so adding its SDK later changes no header or ID.
// Pure and runtime-neutral (Web Crypto), because the BFF and the api both use it.

/** version 00, a 32-hex trace ID, a 16-hex parent span ID, and the flags. */
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ALL_ZEROS = /^0+$/;

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** The trace ID of a valid `traceparent`, or null when it is missing or malformed. */
export function traceIdFrom(traceparent: string | null | undefined): string | null {
  const match = TRACEPARENT.exec(traceparent?.trim().toLowerCase() ?? "");
  if (!match || ALL_ZEROS.test(match[1]!) || ALL_ZEROS.test(match[2]!)) return null;
  return match[1]!;
}

export function newTraceId(): string {
  return randomHex(16);
}

/** A `traceparent` for an outgoing call in `traceId`, from a new span, marked sampled. */
export function toTraceparent(traceId: string): string {
  return `00-${traceId}-${randomHex(8)}-01`;
}
