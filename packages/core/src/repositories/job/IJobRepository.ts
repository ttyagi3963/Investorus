// The durable job port (T288; constitution VIII): a change enqueues a job in its own transaction,
// and the worker claims, completes, or fails it. A job carries the trace ID of the request that
// enqueued it, so the worker can log its run under the same ID.
import type { Job, JobType } from "@clever/contracts/jobs";

/** `runAt` schedules the job for later (a deadline or an expiry); without it the job is due now. */
export type NewJob = { type: JobType; dedupeKey: string; payload: unknown; runAt?: Date };

export interface IJobRepository {
  /** Queues the job, or returns the one already QUEUED or PROCESSING under the same dedupe key. */
  enqueue(job: NewJob): Promise<Job>;
  /**
   * Locks the oldest QUEUED job due by `now` (the worker's clock) for `workerId` (SKIP LOCKED: never
   * one another worker holds).
   */
  claimNext(workerId: string, now: Date): Promise<Job | null>;
  /** Re-queues PROCESSING jobs locked more than `seconds` ago (their worker died); returns how many. */
  reclaimStale(seconds: number): Promise<number>;
  complete(id: string): Promise<void>;
  /**
   * Records a failed run. With `retry`, the job is queued again with a backoff until it has been
   * retried `maxRetries` times; then, or without `retry`, it is FAILED. Returns the job.
   * `error` must already be redacted.
   */
  fail(id: string, error: string, retry: boolean): Promise<Job>;
}
