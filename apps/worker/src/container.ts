// The worker's composition root (T294, constitution I): the one place its adapters are built and
// wired, from validated settings. `dispose` closes the database pool on shutdown.
import {
  MatchingWorkflow,
  createJobHandlers,
  type IErrorReporter,
  type IUnitOfWork,
  type JobHandler,
} from "@clever/core";
import {
  AesGcmPiiCipherImpl,
  LogErrorReporterImpl,
  PostgresDatabaseImpl,
  SystemClockImpl,
  createLogger,
} from "@clever/core/adapters";
import type { JobType } from "@clever/contracts/jobs";
import type { Logger } from "pino";
import type { WorkerEnv } from "./env.js";

export type WorkerContainer = Readonly<{
  uow: IUnitOfWork;
  handlers: Record<JobType, JobHandler>;
  logger: Logger;
  reporter: IErrorReporter;
  dispose: () => Promise<void>;
}>;

export function createContainer(env: WorkerEnv): WorkerContainer {
  const logger = createLogger("worker", { level: env.LOG_LEVEL });
  const db = new PostgresDatabaseImpl(
    env.DATABASE_URL,
    new AesGcmPiiCipherImpl(env.PII_ENCRYPTION_KEY),
  );
  const clock = new SystemClockImpl();
  return Object.freeze({
    uow: db.uow,
    handlers: createJobHandlers({ matching: new MatchingWorkflow(db.uow, { clock }) }),
    logger,
    reporter: new LogErrorReporterImpl(logger),
    dispose: () => db.dispose(),
  });
}
