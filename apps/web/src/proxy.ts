// Route protection (T266, T300, T325; Next.js 16 calls this proxy.ts, not middleware.ts): a
// visitor without a session cookie is sent to /login before any agent, investor, or operations
// page renders. This is a convenience for the browser; the api verifies the token on every request.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./bff/shared";

export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/agent/:path*", "/investor/:path*", "/ops/:path*"] };
