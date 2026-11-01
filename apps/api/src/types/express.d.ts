// Types `res.locals`: the actor, which the authenticate middleware sets for every protected route
// (T073), and the trace ID, which the trace middleware sets for every request (T283).
import type { Actor } from "@clever/contracts/auth";

declare global {
  namespace Express {
    interface Locals {
      actor: Actor;
      traceId: string;
    }
  }
}

export {};
