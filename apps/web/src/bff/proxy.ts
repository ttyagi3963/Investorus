// The BFF proxy (T263): the browser calls `/bff/<path>`, and this forwards to the api's
// `/api/v1/<path>` with the cookie's session token as a bearer token, so the token never reaches
// browser code. A state-changing request from another origin is refused before the api sees it.
// Each call carries the request's `traceparent` (T283) and the caller's Idempotency-Key (T285).
// It never reaches the api's sign-in, whose answer carries the raw token, or leaves /api/v1 (T374).
import {
  forbidden,
  notFound,
  passBackHeaders,
  sameOrigin,
  sessionToken,
  traceparentFor,
} from "./shared";

/**
 * Paths the proxy refuses: none at all; an empty or dot segment, which would resolve outside
 * /api/v1 with the user's bearer token (Next normalises these before routing; this keeps the
 * function safe on its own); and the api's sign-in, whose answer is `{ token, user }`
 * (sign-in goes only through /bff/session, which keeps the token in the cookie). Express matches
 * routes case-insensitively, so the sign-in check does too.
 */
function refused(path: string[]): boolean {
  return (
    path.length === 0 ||
    path.some((segment) => segment === "" || segment === "." || segment === "..") ||
    path[0]!.toLowerCase() === "sessions"
  );
}

export async function forwardToApi(
  request: Request,
  path: string[],
  deps: { apiUrl: string; fetch?: typeof globalThis.fetch },
): Promise<Response> {
  if (refused(path)) return notFound();
  if (!sameOrigin(request)) return forbidden();
  const send = deps.fetch ?? globalThis.fetch;
  const token = sessionToken(request);
  const headers = new Headers({ traceparent: traceparentFor(request) });
  for (const name of ["Content-Type", "Idempotency-Key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const target = `${deps.apiUrl}/api/v1/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;

  const upstream = await send(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });
  return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: passBackHeaders(upstream),
  });
}
