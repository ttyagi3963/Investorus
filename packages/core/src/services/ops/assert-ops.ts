// Every operations service starts here (T341; FR-080): only an OPS user may read the console or
// change anything through it.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError } from "@clever/contracts/common";

export function assertOps(actor: Actor): void {
  if (actor.role !== "OPS") throw new ForbiddenError("Only operations can use the console");
}
