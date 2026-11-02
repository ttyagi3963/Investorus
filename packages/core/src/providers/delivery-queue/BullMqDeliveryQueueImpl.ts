// The delivery queue on Redis with BullMQ (T339; constitution XVIII). The relay adds one job per
// delivery with the delivery's ID as the job ID, so adding it twice queues it once; finished jobs
// are removed, so an operator's retry can queue the same delivery again. The consumer hands each
// job to the DeliveryDispatcher: a RETRY becomes a BullMQ retry after the dispatcher's wait, and a
// delivery set aside is also recorded on the dead-letter queue. A job that threw on every try is
// handed to the dispatcher's giveUp, so its delivery is set aside rather than dropped (T379), and
// queue and connection errors go to the error reporter, not the console. PostgreSQL stays the
// record of every delivery's state; Redis only carries the work, so a lost queue is rebuilt by the
// relay.
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { scrubPiiText } from "../../errors/redact-pii.js";
import type { DeliveryDispatcher } from "../../outbox/DeliveryDispatcher.js";
import { retryDelayMs } from "../../outbox/retry-delay.js";
import type { IErrorReporter } from "../error-reporter/IErrorReporter.js";
import type { IDeliveryConsumer, IDeliveryQueue } from "./IDeliveryQueue.js";

const DELIVERIES = "deliveries";
const DEAD_LETTERS = "deliveries-dlq";

type DeliveryJob = { deliveryId: string; delayMs?: number };

/** The consumer's connection, as a BullMQ Worker needs it: commands wait for Redis to come back. */
const consumerConnection = (redisUrl: string) =>
  new Redis(redisUrl, { maxRetriesPerRequest: null });

/**
 * The producer's connection fails fast while Redis is down, so the relay's queueing transaction
 * rolls back at once and the next tick tries again, instead of waiting inside the transaction.
 */
const producerConnection = (redisUrl: string) =>
  new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });

/** Set-aside deliveries stay on the dead-letter queue a day; PostgreSQL keeps their record. */
const DEAD_LETTER_DAY_MS = 24 * 60 * 60 * 1_000;

export class BullMqDeliveryQueueImpl implements IDeliveryQueue, IDeliveryConsumer {
  private readonly deliveries: Queue<DeliveryJob>;
  private readonly deadLetters: Queue<{ deliveryId: string; error: string }>;
  private readonly connection: Redis;
  private worker: Worker<DeliveryJob> | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    private readonly options: {
      redisUrl: string;
      retry: DeliveryRetryPolicy;
      reporter: IErrorReporter;
    },
  ) {
    this.connection = producerConnection(options.redisUrl);
    this.deliveries = new Queue(DELIVERIES, { connection: this.connection });
    this.deadLetters = new Queue(DEAD_LETTERS, { connection: this.connection });
    // BullMQ forwards its Redis connections' errors here; unheard, it writes them to the console.
    this.deliveries.on("error", this.reportError);
    this.deadLetters.on("error", this.reportError);
  }

  private readonly reportError = (err: Error) =>
    this.options.reporter.report(err, { component: "delivery-queue" });

  async enqueue(deliveryIds: string[]): Promise<void> {
    await this.deliveries.addBulk(
      deliveryIds.map((deliveryId) => ({
        name: "deliver",
        data: { deliveryId },
        opts: {
          jobId: deliveryId,
          // The dispatcher stops earlier; this only bounds a job that keeps crashing.
          attempts: this.options.retry.attempts + 1,
          backoff: { type: "delivery" },
          removeOnComplete: true,
          removeOnFail: true,
        },
      })),
    );
  }

  /** Starts consuming: the dispatcher sends one delivery and says what happened. */
  startConsumer(
    dispatcher: Pick<DeliveryDispatcher, "dispatch" | "giveUp">,
    options: { concurrency: number; onSetAside: (deliveryId: string, error: string) => void },
  ): void {
    const { retry } = this.options;
    const setAside = async (deliveryId: string, error: string) => {
      await this.deadLetters.add("set-aside", { deliveryId, error });
      // Bounded, so a long outage cannot fill Redis's memory (it never evicts).
      await this.deadLetters.clean(DEAD_LETTER_DAY_MS, 1_000, "wait");
      options.onSetAside(deliveryId, error);
    };
    this.workerConnection = consumerConnection(this.options.redisUrl);
    this.worker = new Worker<DeliveryJob>(
      DELIVERIES,
      async (job: Job<DeliveryJob>) => {
        const result = await dispatcher.dispatch(job.data.deliveryId);
        if (result.outcome === "RETRY") {
          await job.updateData({ ...job.data, delayMs: result.delayMs });
          throw new Error(result.error);
        }
        if (result.outcome === "NEEDS_ATTENTION") await setAside(job.data.deliveryId, result.error);
      },
      {
        connection: this.workerConnection,
        concurrency: options.concurrency,
        settings: {
          // The dispatcher's wait; a job that crashed before deciding uses the policy's.
          backoffStrategy: (attemptsMade, _type, _err, job) =>
            (job?.data as DeliveryJob | undefined)?.delayMs ?? retryDelayMs(retry, attemptsMade),
        },
      },
    );
    this.worker.on("error", this.reportError);
    // BullMQ reports every failed try; only the last one, after which it drops the job, matters.
    this.worker.on("failed", (job, err) => {
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      const { deliveryId } = job.data;
      this.options.reporter.report(err, { component: "delivery-queue", delivery_id: deliveryId });
      // An unexpected error may quote a value, so what is stored and logged is scrubbed.
      const error = scrubPiiText(err.message);
      void dispatcher
        .giveUp(deliveryId, error)
        .then(() => setAside(deliveryId, error))
        .catch(this.reportError);
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.workerConnection?.quit();
    await this.deliveries.close();
    await this.deadLetters.close();
    await this.connection.quit();
  }
}
