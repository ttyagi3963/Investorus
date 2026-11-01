// Guards how the worker runs and fails a job (T294; constitution VII, VIII, XII): a job runs inside
// the trace of the request that queued it; an unexpected failure is retried, logged with the job ID
// and its payload redacted, and reported once retries run out; an expected one (a domain error or a
// bad payload) fails at once and is never reported.
import { Writable } from "node:stream";
import { NotFoundError } from "@clever/contracts/common";
import type { Job } from "@clever/contracts/jobs";
import { currentTraceId, type IUnitOfWork, type UnitOfWorkRepositories } from "@clever/core";
import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import { runNextJob } from "./job-runner.js";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const job: Job = {
  id: "job-1",
  type: "MATCH_PACKAGE",
  status: "PROCESSING",
  dedupeKey: "MATCH_PACKAGE:p1:1:1",
  payload: { packageId: "p1", round: 1, listingVersion: 1, fullName: "Maria Lopez" },
  runAt: new Date(),
  retryCount: 0,
  maxRetries: 3,
  error: null,
  correlationId: TRACE,
};

function setup(handler: () => Promise<void>, failedStatus: Job["status"]) {
  const lines: Record<string, unknown>[] = [];
  const logger = pino(
    { level: "info" },
    new Writable({
      write(chunk, _encoding, done) {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
        done();
      },
    }),
  );
  const jobs = {
    claimNext: vi.fn().mockResolvedValue(job),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue({ ...job, status: failedStatus }),
  };
  const uow: IUnitOfWork = {
    run: (work) => work({ jobs } as unknown as UnitOfWorkRepositories),
  };
  const report = vi.fn();
  const run = () =>
    runNextJob({
      uow,
      handlers: {
        MATCH_PACKAGE: handler,
        MATCH_BUY_BOX: handler,
        IMPORT_INVESTORS: handler,
        CLOSE_OFFER_ROUND: handler,
        EXPIRE_OFFER: handler,
        EXPIRE_RECONFIRMATION: handler,
      },
      logger,
      reporter: { report },
      clock: { now: () => new Date() },
      workerId: "worker-a",
    });
  return { run, jobs, report, lines };
}

describe("runNextJob", () => {
  it("runs the job inside the trace of the request that queued it, then completes it", async () => {
    let seen: string | undefined;
    const { run, jobs } = setup(async () => {
      seen = currentTraceId();
    }, "COMPLETED");
    expect(await run()).toBe(true);
    expect(seen).toBe(TRACE);
    expect(jobs.complete).toHaveBeenCalledWith("job-1");
  });

  it("retries an unexpected failure, logs it with the payload redacted, and reports it once FAILED", async () => {
    const retrying = setup(() => Promise.reject(new Error("database timeout")), "QUEUED");
    await retrying.run();
    expect(retrying.jobs.fail).toHaveBeenCalledWith("job-1", "database timeout", true);
    expect(retrying.report).not.toHaveBeenCalled();
    const [line] = retrying.lines;
    expect(line).toMatchObject({ job_id: "job-1", type: "MATCH_PACKAGE" });
    expect(JSON.stringify(line)).not.toContain("Maria");

    const exhausted = setup(() => Promise.reject(new Error("database timeout")), "FAILED");
    await exhausted.run();
    expect(exhausted.report).toHaveBeenCalledOnce();
  });

  it("fails an expected error at once and never reports it", async () => {
    const { run, jobs, report } = setup(
      () => Promise.reject(new NotFoundError("Package not found")),
      "FAILED",
    );
    await run();
    expect(jobs.fail).toHaveBeenCalledWith("job-1", "Package not found", false);
    expect(report).not.toHaveBeenCalled();
  });
});
