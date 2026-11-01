// The BFF's session route (T263, research R12): sign-in goes to the api, and the token it returns is
// set as an HTTP-only, SameSite=Lax cookie (Secure unless COOKIE_SECURE=false), 8 hours, so browser
// code never sees it; only the user goes back. Sign-out clears the cookie.
import type { SessionResponse } from "@clever/contracts/auth";
import { SESSION_COOKIE, forbidden, sameOrigin } from "./shared";

const EIGHT_HOURS = 8 * 60 * 60;

const cookie = (value: string, maxAge: number, secure: boolean) =>
  [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");

export async function signIn(
  request: Request,
  deps: { apiUrl: string; secureCookie: boolean; fetch?: typeof globalThis.fetch },
): Promise<Response> {
  if (!sameOrigin(request)) return forbidden();
  const send = deps.fetch ?? globalThis.fetch;
  const upstream = await send(`${deps.apiUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
  if (upstream.status !== 201) {
    // A refusal or an outage goes back as the api sent it, JSON or not.
    const type = upstream.headers.get("content-type");
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: type ? { "Content-Type": type } : {},
    });
  }
  const body = (await upstream.json()) as SessionResponse;
  return Response.json(
    { user: body.user },
    { status: 201, headers: { "Set-Cookie": cookie(body.token, EIGHT_HOURS, deps.secureCookie) } },
  );
}

export async function signOut(request: Request, secureCookie = true): Promise<Response> {
  if (!sameOrigin(request)) return forbidden();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": cookie("", 0, secureCookie) },
  });
}
