// Route protection (T266, T300, T325, T358; Next.js 16 calls this proxy.ts, not middleware.ts): a
// visitor without a session cookie is sent to /login before any agent, investor, or operations
// page renders, and a signed-in user who opens another role's pages is sent to their own home. The
// role is read from the token without checking its signature: it only chooses a page. The api
// verifies the token, and the role, on every request.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./bff/shared";
import { areaRole, ROLE_HOME } from "./features/auth/role-home";

/** The role claim in a JWT's payload, or null if the token cannot be read. */
function roleIn(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    );
    const role = (payload as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  const role = roleIn(token);
  const home = role && Object.hasOwn(ROLE_HOME, role) ? ROLE_HOME[role] : undefined;
  if (home && areaRole(request.nextUrl.pathname) !== role) {
    return NextResponse.redirect(new URL(home, request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/agent/:path*", "/investor/:path*", "/ops/:path*"] };
