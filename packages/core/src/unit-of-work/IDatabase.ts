// The database port (T276): everything an app's composition root needs from a database, behind
// one interface, so swapping the database (for example to MySQL) is a new implementation plus one
// line in container.ts. Services still see only the unit of work.
import type { IUnitOfWork } from "./IUnitOfWork.js";

export interface IDatabase {
  /** Runs a change's writes in one transaction; what every service receives. */
  readonly uow: IUnitOfWork;
  /** Resolves when the database answers; throws an InfrastructureError when it does not. */
  check(): Promise<void>;
  /** Closes the connections, on shutdown. */
  dispose(): Promise<void>;
}
