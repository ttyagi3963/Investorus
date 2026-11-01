// Route protection (T266; Next.js 16 calls this proxy.ts, not middleware.ts): a visitor without a
// session cookie is sent to /login before any agent page renders. This is a convenience for the
// browser; the api verifies the token on every request regardless.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  if (!request.cookies.get("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/agent/:path*"] };
