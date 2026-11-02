// The role checks every service and workflow starts with (FR-080), in one place: each refuses any
// other role with the caller's own message, and an agent's or investor's check returns their ID.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError } from "@clever/contracts/common";

export function agentOf(actor: Actor, message: string): string {
  if (actor.role !== "AGENT") throw new ForbiddenError(message);
  return actor.agentId;
}

export function investorOf(actor: Actor, message: string): string {
  if (actor.role !== "INVESTOR") throw new ForbiddenError(message);
  return actor.investorId;
}

export function assertOps(actor: Actor, message: string): void {
  if (actor.role !== "OPS") throw new ForbiddenError(message);
}
