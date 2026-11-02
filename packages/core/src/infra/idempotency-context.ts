// The idempotency claim of the request being handled (T367), kept in AsyncLocalStorage like the
// trace ID: the api's idempotency middleware sets it, and the Prisma unit of work reads it to mark
// the claim committed in the same transaction as the request's first write.
import { AsyncLocalStorage } from "node:async_hooks";

export type IdempotencyClaimRef = { userId: string; key: string; token: string };

const storage = new AsyncLocalStorage<IdempotencyClaimRef>();

/** Runs `work`, and everything it awaits or schedules, under the claim. */
export function runWithIdempotencyClaim<T>(claim: IdempotencyClaimRef, work: () => T): T {
  return storage.run(claim, work);
}

/** The claim of the request being handled, if it is a covered write. */
export function currentIdempotencyClaim(): IdempotencyClaimRef | undefined {
  return storage.getStore();
}
