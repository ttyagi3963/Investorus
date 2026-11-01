// The api's front door (T253): every request except sign-in and health must carry
// `Authorization: Bearer <session token>`. The token is verified by AuthService, and the actor it
// names is put on `res.locals.actor` for the route; anything else is a 401.
import type { Actor } from "@clever/contracts/auth";
import { UnauthenticatedError } from "@clever/contracts/common";
import type { RequestHandler } from "express";

const PUBLIC = new Set(["POST /api/v1/sessions", "GET /api/v1/health"]);

export function authenticate(auth: { verify(token: string): Promise<Actor> }): RequestHandler {
  return async (req, res, next) => {
    if (PUBLIC.has(`${req.method} ${req.path}`)) return next();
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
