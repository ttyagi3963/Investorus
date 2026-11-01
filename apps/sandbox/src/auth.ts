// The shared-token check for the sandbox's internal routes: the platform's api and worker send
// SANDBOX_INTERNAL_TOKEN in x-sandbox-token, compared in constant time so timing reveals nothing.
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Answers 401 unless the request carries the shared internal token. */
export function requireInternalToken(token: string): RequestHandler {
  return (req, res, next) => {
    if (!sameSecret(String(req.headers["x-sandbox-token"] ?? ""), token)) {
      return void res.status(401).json({ error: "Missing or invalid sandbox token" });
    }
    next();
  };
}
