// The delivery queue on Redis with BullMQ (T339; constitution XVIII). The relay adds one job per
// delivery with the delivery's ID as the job ID, so adding it twice queues it once; finished jobs
// are removed, so an operator's retry can queue the same delivery again. The consumer hands each
// job to the DeliveryDispatcher: a RETRY becomes a BullMQ retry after the dispatcher's wait, and a
// delivery set aside is also recorded on the dead-letter queue. PostgreSQL stays the record of
// every delivery's state; Redis only carries the work, so a lost queue is rebuilt by the relay.
import type { DeliveryRetryPolicy } from "@clever/contracts/config";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { DispatchResult } from "../../outbox/DeliveryDispatcher.js";
import { retryDelayMs } from "../../outbox/retry-delay.js";
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

  constructor(private readonly options: { redisUrl: string; retry: DeliveryRetryPolicy }) {
    this.connection = producerConnection(options.redisUrl);
    this.deliveries = new Queue(DELIVERIES, { connection: this.connection });
    this.deadLetters = new Queue(DEAD_LETTERS, { connection: this.connection });
  }

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

  /** Starts consuming: `dispatch` sends one delivery and says what happened. */
  startConsumer(
    dispatch: (deliveryId: string) => Promise<DispatchResult>,
    options: { concurrency: number; onSetAside: (deliveryId: string, error: string) => void },
  ): void {
    const { retry } = this.options;
    this.workerConnection = consumerConnection(this.options.redisUrl);
    this.worker = new Worker<DeliveryJob>(
      DELIVERIES,
      async (job: Job<DeliveryJob>) => {
        const result = await dispatch(job.data.deliveryId);
        if (result.outcome === "RETRY") {
          await job.updateData({ ...job.data, delayMs: result.delayMs });
          throw new Error(result.error);
        }
        if (result.outcome === "NEEDS_ATTENTION") {
          await this.deadLetters.add("set-aside", {
            deliveryId: job.data.deliveryId,
            error: result.error,
          });
          // Bounded, so a long outage cannot fill Redis's memory (it never evicts).
          await this.deadLetters.clean(DEAD_LETTER_DAY_MS, 1_000, "wait");
          options.onSetAside(job.data.deliveryId, result.error);
        }
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
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.workerConnection?.quit();
    await this.deliveries.close();
    await this.deadLetters.close();
    await this.connection.quit();
  }
}
