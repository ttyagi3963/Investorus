// The api's front door (T253, T348): every request except sign-in, health, and the brand list and
// themes (the sign-in page renders a brand before anyone signs in) must carry
// `Authorization: Bearer <session token>`. The token is verified by AuthService, and the actor it
// names is put on `res.locals.actor` for the route; anything else is a 401.
import type { Actor } from "@clever/contracts/auth";
import { UnauthenticatedError } from "@clever/contracts/common";
import type { RequestHandler } from "express";

const PUBLIC: readonly [method: string, path: RegExp][] = [
  ["POST", /^\/api\/v1\/sessions$/],
  ["GET", /^\/api\/v1\/health$/],
  ["GET", /^\/api\/v1\/brands$/],
  ["GET", /^\/api\/v1\/brands\/[^/]+\/theme$/],
];

export function authenticate(auth: { verify(token: string): Promise<Actor> }): RequestHandler {
  return async (req, res, next) => {
    if (PUBLIC.some(([method, path]) => req.method === method && path.test(req.path))) return next();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!token) return next(new UnauthenticatedError("Sign in first"));
    try {
      res.locals.actor = await auth.verify(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}
