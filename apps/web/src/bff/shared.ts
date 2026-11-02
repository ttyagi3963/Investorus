// What the BFF's routes share: the CSRF check (a state-changing request must come from this site's
// own pages, scheme and host, research R12), reading and writing the session cookie, whether a cookie is Secure
// (T372), and the trace and idempotency headers (T283, T381). Pure functions over the standard
// Request, so they can be tested without Next.
import { newTraceId, toTraceparent, traceIdFrom } from "@clever/contracts/common";

export const SESSION_COOKIE = "session";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * True unless a state-changing request lacks an Origin naming this site, scheme and host (T389), so
 * a plain-HTTP page cannot post to the site served over HTTPS. The host is the Host header the
 * browser sent, not the request URL: inside the container the server listens on 0.0.0.0, so the URL
 * names that address instead. The scheme is the one cameOverHttps reads. X-Forwarded-Host is not
 * trusted: nothing in front of this server sets it.
 */
export function sameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = URL.parse(request.headers.get("origin") ?? "")?.origin;
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  return origin === URL.parse(`${cameOverHttps(request) ? "https" : "http"}://${host}`)?.origin;
}

/**
 * Whether the browser reached this site over HTTPS: the request URL says so, or a TLS-terminating
 * proxy's X-Forwarded-Proto does.
 */
export function cameOverHttps(request: { url?: string; headers: Pick<Headers, "get"> }): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwarded === "https" || URL.parse(request.url ?? "")?.protocol === "https:";
}

/** COOKIE_SECURE: `auto` follows the request; `true` and `false` force the Secure flag. */
export type CookieSecure = "auto" | "true" | "false";

/**
 * Whether to mark a cookie Secure. In `auto` it is Secure when the browser reached this site over
 * HTTPS (cameOverHttps). A Secure cookie set over plain HTTP on any host but localhost is dropped
 * by the browser, so sign-in would never stick there.
 */
export function cookieIsSecure(
  setting: CookieSecure,
  request: { url?: string; headers: Pick<Headers, "get"> },
): boolean {
  if (setting !== "auto") return setting === "true";
  return cameOverHttps(request);
}

/**
 * The session cookie's Set-Cookie value: HTTP-only and SameSite=Lax always, Secure per
 * cookieIsSecure. An empty value with Max-Age 0 clears it.
 */
export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function forbidden(): Response {
  return Response.json({ error: "Cross-site request refused", code: "FORBIDDEN" }, { status: 403 });
}

export function notFound(): Response {
  return Response.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
}

export function sessionToken(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value.length > 0) return value.join("=");
  }
  return undefined;
}

/** The `traceparent` for the api call: the caller's trace ID when its header is valid, else a new one. */
export function traceparentFor(request: { headers: Pick<Headers, "get"> }): string {
  return toTraceparent(traceIdFrom(request.headers.get("traceparent")) ?? newTraceId());
}

/**
 * The api's answer headers the browser gets: its content type, the request's trace ID, and its
 * idempotency headers (contracts/api.md): when to retry a 409 or 503, and that an answer is a
 * replay.
 */
export function passBackHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of ["Content-Type", "X-Request-Id", "Retry-After", "Idempotent-Replay"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
