// The job loop (T294; constitution VIII): each tick re-queues jobs whose worker died, then claims
// and runs the jobs due by the clock until none is left. Each job runs inside its own trace (the ID of the request
// that queued it, or a new one), so every line of its run logs that ID. Stopping lets the running
// job finish and claims no more.
import { newTraceId } from "@clever/contracts/common";
import {
  runWithTrace,
  type IClock,
  type IErrorReporter,
  type IUnitOfWork,
  type JobHandler,
} from "@clever/core";
import type { JobType } from "@clever/contracts/jobs";
import type { Logger } from "pino";
import { translateJobError } from "./error-translator.js";

/** A PROCESSING job locked this long ago lost its worker. */
const STALE_AFTER_SECONDS = 60;

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
      await deps.handlers[job.type](job.payload);
      await deps.uow.run((repos) => repos.jobs.complete(job.id));
      logger.info("job completed");
    } catch (err) {
      await translateJobError(err, job, { ...deps, logger });
    }
  });
  return true;
}

/** Runs a tick every `intervalMs` until stopped; a failed tick is reported and the loop goes on. */
export function startJobLoop(deps: JobRunnerDeps, intervalMs = 1_000): { stop(): Promise<void> } {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    try {
      await deps.uow.run((repos) => repos.jobs.reclaimStale(STALE_AFTER_SECONDS));
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
