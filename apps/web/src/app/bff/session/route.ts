// The BFF session route (T263): POST signs in and sets the HTTP-only session cookie, DELETE signs
// out. The logic lives in src/bff/session.ts, where it is tested.
import { signIn, signOut } from "@/bff/session";
import { serverEnv } from "@/env";

export const POST = (request: Request) =>
  signIn(request, { apiUrl: serverEnv().API_URL, secureCookie: serverEnv().COOKIE_SECURE });
export const DELETE = (request: Request) => signOut(request, serverEnv().COOKIE_SECURE);
export const dynamic = "force-dynamic";
