// Route protection (T266, T300, T325, T358, T374; Next.js 16 calls this proxy.ts, not
// middleware.ts): a visitor without a usable session is sent to /login before any agent, investor,
// or operations page renders, and a signed-in user who opens another role's pages is sent to their
// own home. The token is read without checking its signature: it only chooses a page. The api
// verifies the token, and the role, on every request. Every answer also gets the page policy and,
// over HTTPS, HSTS (T389), set here because the policy names the storage the settings give.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cameOverHttps, cookieIsSecure, sessionCookie } from "./bff/shared";
import { serverEnv, storageOrigin } from "./env";
import { areaRole, ROLE_HOME } from "./features/auth/role-home";
import { pageSecurityHeaders } from "./security-headers";

/** The token's role, if it can be read, names a known role, and has not expired; else null. */
function liveRole(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    const { role, exp } = payload as { role?: unknown; exp?: unknown };
    const live = typeof exp === "number" && exp * 1000 > Date.now();
    return live && typeof role === "string" && Object.hasOwn(ROLE_HOME, role) ? role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const response =
    areaRole(request.nextUrl.pathname) === null ? NextResponse.next() : guardArea(request);
  const env = serverEnv();
  const headers = pageSecurityHeaders({
    storageOrigin: storageOrigin(env),
    https: cameOverHttps(request),
    dev: process.env.NODE_ENV === "development",
  });
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

function guardArea(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  const role = liveRole(token);
  if (!role) {
    // A corrupt, unknown, or expired cookie fails closed, and is cleared so /login starts clean.
    const toLogin = NextResponse.redirect(new URL("/login", request.url));
    const secure = cookieIsSecure(serverEnv().COOKIE_SECURE, request);
    toLogin.headers.set("Set-Cookie", sessionCookie("", 0, secure));
    return toLogin;
  }
  if (areaRole(request.nextUrl.pathname) !== role) {
    return NextResponse.redirect(new URL(ROLE_HOME[role]!, request.url));
  }
  return NextResponse.next();
}

// Every page and BFF answer, for the page policy; Next's hashed static files need none.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
