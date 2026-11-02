// The worker's error translator (T294; constitution VII): every failed job run goes through here.
// An expected failure (a DomainError, or a payload that fails its schema) is final: the job is
// FAILED at once and nothing is reported. A ConflictError is not: a row changed under the job, and
// a retry reads it again (T376). Anything else is retried with a backoff, and reported
// through IErrorReporter once the job has used its retries. A run whose worker died is a used try
// too, reported once it leaves the job FAILED; a worker that lost its lease records nothing (T378).
// The log line carries the job ID, its type, and the payload with PII redacted; the trace ID comes
// from the job's trace context.
import { ConflictError, DomainError } from "@clever/contracts/common";
import type { Job } from "@clever/contracts/jobs";
import { redactPii, scrubPiiText, type IErrorReporter, type IUnitOfWork } from "@clever/core";
import type { Logger } from "pino";
import { ZodError } from "zod";

export async function translateJobError(
  err: unknown,
  job: Job,
  deps: { uow: IUnitOfWork; logger: Logger; reporter: IErrorReporter; workerId: string },
): Promise<void> {
  const expected =
    (err instanceof DomainError && !(err instanceof ConflictError)) || err instanceof ZodError;
  const message = scrubPiiText(err instanceof Error ? err.message : String(err));
  const failed = await deps.uow.run((repos) =>
    repos.jobs.fail(job.id, deps.workerId, message, !expected),
  );
  // The logger is the job's child logger, which already names the job ID and type.
  if (!failed) {
    deps.logger.warn(
      { err: message },
      "job failed after another worker took it over; not recorded",
    );
    return;
  }
  const payload = redactPii(job.payload);
  deps.logger.warn(
    { payload, status: failed.status, retryCount: failed.retryCount, err: message },
    expected ? "job failed (not retried)" : "job failed",
  );
  if (!expected && failed.status === "FAILED") {
    deps.reporter.report(err, { job_id: job.id, type: job.type, payload });
  }
}

/** A job taken back from a worker that stopped renewing its lease: queued again, or FAILED. */
export function translateLostRun(
  job: Job,
  deps: { logger: Logger; reporter: IErrorReporter },
): void {
  const payload = redactPii(job.payload);
  deps.logger.warn(
    { job_id: job.id, type: job.type, payload, status: job.status, retryCount: job.retryCount },
    "job lost its worker",
  );
  if (job.status === "FAILED") {
    deps.reporter.report(new Error(job.error ?? "job lost its worker"), {
      job_id: job.id,
      type: job.type,
      payload,
    });
  }
}
