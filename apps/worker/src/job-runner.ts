// The job loop (T294; constitution VIII): each tick takes back the jobs whose worker died, then claims
// and runs the jobs due by the clock until none is left. A claim is a lease the runner renews while
// the handler runs, so a long run is never taken over (T378). Each job runs inside its own trace (the
// ID of the request that queued it, or a new one), so every line of its run logs that ID. Stopping
// lets the running job finish and claims no more.
import { newTraceId } from "@clever/contracts/common";
import type { Job, JobType } from "@clever/contracts/jobs";
import {
  runWithTrace,
  scrubPiiText,
  type IClock,
  type IErrorReporter,
  type IUnitOfWork,
  type JobHandler,
} from "@clever/core";
import type { Logger } from "pino";
import { translateJobError, translateLostRun } from "./error-translator.js";

/** A PROCESSING job whose lease is this old lost its worker. */
const LEASE_SECONDS = 60;
/** The runner renews a lease three times in its length, so one slow renewal does not lose it. */
const RENEW_EVERY_MS = (LEASE_SECONDS * 1_000) / 3;

export type JobRunnerDeps = {
  uow: IUnitOfWork;
  handlers: Record<JobType, JobHandler>;
  logger: Logger;
  reporter: IErrorReporter;
  clock: IClock;
  workerId: string;
};

/** Claims and runs one due job; false when there was none. */
export async function runNextJob(deps: JobRunnerDeps): Promise<boolean> {
  const job = await deps.uow.run((repos) => repos.jobs.claimNext(deps.workerId, deps.clock.now()));
  if (!job) return false;
  await runWithTrace(job.correlationId ?? newTraceId(), async () => {
    const logger = deps.logger.child({ job_id: job.id, type: job.type });
    try {
      const lease = keepLease(job, deps, logger);
      try {
        await deps.handlers[job.type](job.payload);
      } finally {
        lease.stop();
      }
      if (await deps.uow.run((repos) => repos.jobs.complete(job.id, deps.workerId))) {
        logger.info("job completed");
      } else {
        logger.warn("job finished after another worker took it over; that worker records it");
      }
    } catch (err) {
      await translateJobError(err, job, { ...deps, logger });
    }
  });
  return true;
}

/** Renews the job's lease every RENEW_EVERY_MS until the handler settles or the lease is lost. */
function keepLease(job: Job, deps: JobRunnerDeps, logger: Logger): { stop(): void } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const renew = async () => {
    try {
      const held = await deps.uow.run((repos) => repos.jobs.renewLease(job.id, deps.workerId));
      if (stopped) return;
      if (!held) {
        logger.warn("job lost its lease to another worker");
        return;
      }
    } catch (err) {
      // The next renewal may still reach the database before the lease runs out.
      logger.warn({ err: scrubPiiText(String(err)) }, "job lease renewal failed");
    }
    if (!stopped) timer = setTimeout(() => void renew(), RENEW_EVERY_MS);
  };
  timer = setTimeout(() => void renew(), RENEW_EVERY_MS);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/** Runs a tick every `intervalMs` until stopped; a failed tick is reported and the loop goes on. */
export function startJobLoop(deps: JobRunnerDeps, intervalMs = 1_000): { stop(): Promise<void> } {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    try {
      const lost = await deps.uow.run((repos) => repos.jobs.reclaimStale(LEASE_SECONDS));
      for (const job of lost) {
        runWithTrace(job.correlationId ?? newTraceId(), () => translateLostRun(job, deps));
      }
      while (!stopping && (await runNextJob(deps)));
    } catch (err) {
      deps.reporter.report(err, { workerId: deps.workerId });
    }
  };
  const schedule = () => {
    timer = setTimeout(() => {
      running = tick().finally(() => {
        if (!stopping) schedule();
      });
    }, intervalMs);
  };
  schedule();

  return {
    stop: async () => {
      stopping = true;
      clearTimeout(timer);
      await running;
    },
  };
}
