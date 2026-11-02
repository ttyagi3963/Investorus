// Route protection (T266, T300, T325, T358, T374; Next.js 16 calls this proxy.ts, not
// middleware.ts): a visitor without a usable session is sent to /login before any agent, investor,
// or operations page renders, and a signed-in user who opens another role's pages is sent to their
// own home. The token is read without checking its signature: it only chooses a page. The api
// verifies the token, and the role, on every request.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieIsSecure, sessionCookie } from "./bff/shared";
import { serverEnv } from "./env";
import { areaRole, ROLE_HOME } from "./features/auth/role-home";

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

export const config = { matcher: ["/agent/:path*", "/investor/:path*", "/ops/:path*"] };
