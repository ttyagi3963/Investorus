// The BFF's session route (T263, research R12): sign-in goes to the api, and the token it returns is
// set as an HTTP-only, SameSite=Lax cookie (Secure per COOKIE_SECURE; T372), 8 hours, so browser
// code never sees it; only the user goes back. Sign-out clears the cookie. The sign-in call carries
// the request's `traceparent` (T283).
import type { SessionResponse } from "@clever/contracts/auth";
import {
  type CookieSecure,
  cookieIsSecure,
  forbidden,
  passBackHeaders,
  sameOrigin,
  sessionCookie,
  traceparentFor,
} from "./shared";

const EIGHT_HOURS = 8 * 60 * 60;

export async function signIn(
  request: Request,
  deps: { apiUrl: string; cookieSecure: CookieSecure; fetch?: typeof globalThis.fetch },
): Promise<Response> {
  if (!sameOrigin(request)) return forbidden();
  const send = deps.fetch ?? globalThis.fetch;
  const upstream = await send(`${deps.apiUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", traceparent: traceparentFor(request) },
    body: await request.text(),
  });
  if (upstream.status !== 201) {
    // A refusal or an outage goes back as the api sent it, JSON or not.
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: passBackHeaders(upstream),
    });
  }
  const body = (await upstream.json()) as SessionResponse;
  return Response.json(
    { user: body.user },
    {
      status: 201,
      headers: {
        "Set-Cookie": sessionCookie(
          body.token,
          EIGHT_HOURS,
          cookieIsSecure(deps.cookieSecure, request),
        ),
      },
    },
  );
}

export async function signOut(request: Request, cookieSecure: CookieSecure): Promise<Response> {
  if (!sameOrigin(request)) return forbidden();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": sessionCookie("", 0, cookieIsSecure(cookieSecure, request)) },
  });
}
