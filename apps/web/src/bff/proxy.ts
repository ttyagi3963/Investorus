// The BFF proxy (T263): the browser calls `/bff/<path>`, and this forwards to the api's
// `/api/v1/<path>` with the cookie's session token as a bearer token, so the token never reaches
// browser code. A state-changing request from another origin is refused before the api sees it.
// Each call carries the request's `traceparent` (T283) and the caller's Idempotency-Key (T285).
import { forbidden, passBackHeaders, sameOrigin, sessionToken, traceparentFor } from "./shared";

export async function forwardToApi(
  request: Request,
  path: string[],
  deps: { apiUrl: string; fetch?: typeof globalThis.fetch },
): Promise<Response> {
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
