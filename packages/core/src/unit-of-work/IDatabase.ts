// The database port (T276): everything an app's composition root needs from a database, behind
// one interface, so services and routes never see the ORM: an ORM or driver swap (Prisma to Drizzle
// or raw pg) is a new implementation plus one line in container.ts. Leaving PostgreSQL is not: the
// design relies on its guarantees (SKIP LOCKED, partial unique indexes, transaction IDs, triggers;
// research.md). Services see only the unit of work; the idempotency middleware uses the key store.
import type { IIdempotencyStore } from "../repositories/idempotency/IIdempotencyStore.js";
import type { IUnitOfWork } from "./IUnitOfWork.js";

export interface IDatabase {
  /** Runs a change's writes in one transaction; what every service receives. */
  readonly uow: IUnitOfWork;
  /** The Idempotency-Key store, outside any change's transaction. */
  readonly idempotency: IIdempotencyStore;
  /** Resolves when the database answers; throws an InfrastructureError when it does not. */
  check(): Promise<void>;
  /** Closes the connections, on shutdown. */
  dispose(): Promise<void>;
}
