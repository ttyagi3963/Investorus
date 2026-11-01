// The worker's composition root (T294, T322, constitution I): the one place its adapters are built
// and wired, from validated settings. STORAGE_PROVIDER picks the sandbox or S3, as in the api, so
// the investor import reads the file where the browser uploaded it. `dispose` closes the pool.
import {
  DealLifecycleWorkflow,
  InvestorImportWorkflow,
  MatchingWorkflow,
  OfferRoundWorkflow,
  createJobHandlers,
  type IClock,
  type IErrorReporter,
  type IUnitOfWork,
  type JobHandler,
} from "@clever/core";
import {
  AesGcmPiiCipherImpl,
  LogErrorReporterImpl,
  PostgresDatabaseImpl,
  S3StorageProviderImpl,
  SandboxStorageProviderImpl,
  StaticGeoProviderImpl,
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
  clock: IClock;
  dispose: () => Promise<void>;
}>;

export function createContainer(env: WorkerEnv): WorkerContainer {
  const logger = createLogger("worker", { level: env.LOG_LEVEL });
  const db = new PostgresDatabaseImpl(
    env.DATABASE_URL,
    new AesGcmPiiCipherImpl(env.PII_ENCRYPTION_KEY),
  );
  const clock = new SystemClockImpl();
  const storage =
    env.STORAGE_PROVIDER === "s3"
      ? new S3StorageProviderImpl({ bucket: env.S3_BUCKET, region: env.S3_REGION, clock })
      : new SandboxStorageProviderImpl({
          publicUrl: env.PUBLIC_SANDBOX_URL,
          internalUrl: env.SANDBOX_URL,
          signingKey: env.STORAGE_SIGNING_KEY,
          internalToken: env.SANDBOX_INTERNAL_TOKEN,
          clock,
        });
  return Object.freeze({
    uow: db.uow,
    handlers: createJobHandlers({
      matching: new MatchingWorkflow(db.uow, { clock }),
      offerRound: new OfferRoundWorkflow(db.uow),
      deals: new DealLifecycleWorkflow(db.uow, { clock }),
      imports: new InvestorImportWorkflow(db.uow, {
        storage,
        geo: new StaticGeoProviderImpl(),
        clock,
      }),
    }),
    logger,
    reporter: new LogErrorReporterImpl(logger),
    clock,
    dispose: () => db.dispose(),
  });
}
