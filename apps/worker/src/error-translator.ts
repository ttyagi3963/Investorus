// The worker's error translator (T294; constitution VII): every failed job run goes through here.
// An expected failure (a DomainError, or a payload that fails its schema) is final: the job is
// FAILED at once and nothing is reported. A ConflictError is not: a row changed under the job, and
// a retry reads it again (T376). Anything else is retried with a backoff, and reported
// through IErrorReporter once the job has used its retries. The log line carries the job ID, its
// type, and the payload with PII redacted; the trace ID comes from the job's trace context.
import { ConflictError, DomainError } from "@clever/contracts/common";
import type { Job } from "@clever/contracts/jobs";
import { redactPii, scrubPiiText, type IErrorReporter, type IUnitOfWork } from "@clever/core";
import type { Logger } from "pino";
import { ZodError } from "zod";

export async function translateJobError(
  err: unknown,
  job: Job,
  deps: { uow: IUnitOfWork; logger: Logger; reporter: IErrorReporter },
): Promise<void> {
  const expected =
    (err instanceof DomainError && !(err instanceof ConflictError)) || err instanceof ZodError;
  const message = scrubPiiText(err instanceof Error ? err.message : String(err));
  const failed = await deps.uow.run((repos) => repos.jobs.fail(job.id, message, !expected));
  const payload = redactPii(job.payload);
  // The logger is the job's child logger, which already names the job ID and type.
  deps.logger.warn(
    { payload, status: failed.status, retryCount: failed.retryCount, err: message },
    expected ? "job failed (not retried)" : "job failed",
  );
  if (!expected && failed.status === "FAILED") {
    deps.reporter.report(err, { job_id: job.id, type: job.type, payload });
  }
}
