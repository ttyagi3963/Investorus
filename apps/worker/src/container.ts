// The worker's composition root (T294, T322, T339, constitution I): the one place its adapters are
// built and wired, from validated settings. STORAGE_PROVIDER picks the sandbox or S3, as in the api,
// so the investor import reads the file where the browser uploaded it. Deliveries use the BullMQ
// queue on Redis with the retry policy read from ConfigEntry["deliveryRetry"] at startup, and the
// sandbox CRM and messaging providers. `dispose` closes the queue and then the pool.
import {
  DealLifecycleWorkflow,
  DeliveryDispatcher,
  MatchDigestWorkflow,
  OutboxRelay,
  readConfig,
  type IDeliveryConsumer,
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
  BullMqDeliveryQueueImpl,
  SandboxCrmProviderImpl,
  SandboxMessagingProviderImpl,
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
  relay: OutboxRelay;
  digests: MatchDigestWorkflow;
  dispatcher: DeliveryDispatcher;
  deliveries: IDeliveryConsumer;
  dispose: () => Promise<void>;
}>;

export async function createContainer(env: WorkerEnv): Promise<WorkerContainer> {
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
  const retry = await db.uow.run((repos) => readConfig(repos.config, "deliveryRetry"));
  const queue = new BullMqDeliveryQueueImpl({ redisUrl: env.REDIS_URL, retry });
  const sandbox = { internalUrl: env.SANDBOX_URL, internalToken: env.SANDBOX_INTERNAL_TOKEN };
  const digests = new MatchDigestWorkflow(db.uow, { clock });
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
      digests,
    }),
    logger,
    reporter: new LogErrorReporterImpl(logger),
    clock,
    relay: new OutboxRelay(db.uow, { queue, clock }),
    digests,
    dispatcher: new DeliveryDispatcher(db.uow, {
      crm: new SandboxCrmProviderImpl(sandbox),
      messaging: new SandboxMessagingProviderImpl(sandbox),
      clock,
      retry,
    }),
    deliveries: queue,
    dispose: async () => {
      await queue.close();
      await db.dispose();
    },
  });
}
