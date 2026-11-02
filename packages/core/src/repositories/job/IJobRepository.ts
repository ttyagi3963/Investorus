// The durable job port (T288; constitution VIII): a change enqueues a job in its own transaction,
// and the worker claims, completes, or fails it. A job carries the trace ID of the request that
// enqueued it, so the worker can log its run under the same ID. A claim is a lease the worker
// renews while the job runs; only the worker holding it can complete or fail the job (T378).
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
  /** Restarts the lease's clock; false when `workerId` no longer holds the job. */
  renewLease(id: string, workerId: string): Promise<boolean>;
  /**
   * Takes back PROCESSING jobs whose lease is more than `seconds` old (their worker died). The lost
   * run counts as a try: the job is queued again, or FAILED once its retries are used. Returns them.
   */
  reclaimStale(seconds: number): Promise<Job[]>;
  /** Marks the job COMPLETED; false, changing nothing, when `workerId` no longer holds it. */
  complete(id: string, workerId: string): Promise<boolean>;
  /**
   * Records a failed run. With `retry`, the job is queued again with a backoff until it has been
   * retried `maxRetries` times; then, or without `retry`, it is FAILED. Returns the job, or null,
   * changing nothing, when `workerId` no longer holds it. `error` must already be redacted.
   */
  fail(id: string, workerId: string, error: string, retry: boolean): Promise<Job | null>;
}
