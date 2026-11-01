// Types `res.locals.actor`, which the authenticate middleware sets for every protected route (T073).
import type { Actor } from "@clever/contracts/auth";

declare global {
  namespace Express {
    interface Locals {
      actor: Actor;
    }
  }
}

export {};
