// What the BFF's routes share: the CSRF check (a state-changing request must come from this site's
// own pages, research R12), reading the session token from the cookie, and the trace headers
// (T283). Pure functions over the standard Request, so they can be tested without Next.
import { newTraceId, toTraceparent, traceIdFrom } from "@clever/contracts/common";

export const SESSION_COOKIE = "session";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

/**
 * True unless a state-changing request lacks an Origin naming this site. The site is the Host
 * header the browser sent, not the request URL: inside the container the server listens on
 * 0.0.0.0, so the URL names that address instead.
 */
export function sameOrigin(request: Request): boolean {
  if (SAFE_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return origin !== null && host !== null && URL.parse(origin)?.host === host;
}

export function forbidden(): Response {
  return Response.json({ error: "Cross-site request refused", code: "FORBIDDEN" }, { status: 403 });
}

export function sessionToken(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value.length > 0) return value.join("=");
  }
  return undefined;
}

/** The `traceparent` for the api call: the caller's trace ID when its header is valid, else a new one. */
export function traceparentFor(request: Request): string {
  return toTraceparent(traceIdFrom(request.headers.get("traceparent")) ?? newTraceId());
}

/** The api's answer headers the browser gets: its content type and the request's trace ID. */
export function passBackHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of ["Content-Type", "X-Request-Id"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
