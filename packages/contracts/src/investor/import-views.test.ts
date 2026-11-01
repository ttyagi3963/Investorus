// Guards what operations see of an import (T323): a refused file or a job that gave up is FAILED,
// with a message for the job case; a finished batch is COMPLETED; a job being worked on is RUNNING,
// and one not yet picked up is QUEUED. A wrong mapping would show a failed import as finished.
import { describe, expect, it } from "vitest";
import type { ImportBatch } from "./import.js";
import { toImportBatchView } from "./import-views.js";

const batch: ImportBatch = {
  id: "batch-1",
  fileName: "investors.csv",
  storageKey: "imports/i.csv",
  jobId: "job-1",
  totalRows: null,
  imported: 0,
  updated: 0,
  rejected: 0,
  ignoredColumns: [],
  error: null,
  createdBy: "user-ops",
  createdAt: new Date("2026-11-01T12:00:00Z"),
  finishedAt: null,
};
const view = (
  change: Partial<ImportBatch>,
  jobStatus: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED",
) => toImportBatchView({ batch: { ...batch, ...change }, rows: [], jobStatus });
const done = new Date("2026-11-01T12:01:00Z");

describe("toImportBatchView", () => {
  it("reports a refused file and a job that gave up as failed", () => {
    expect(
      view({ error: "The file has no Email column", finishedAt: done }, "COMPLETED"),
    ).toMatchObject({
      status: "FAILED",
      error: "The file has no Email column",
    });
    expect(view({}, "FAILED")).toMatchObject({
      status: "FAILED",
      error: "The import stopped before it finished. Upload the file again.",
    });
  });

  it("reports a finished batch as completed, and a waiting or working job as queued or running", () => {
    expect(view({ finishedAt: done }, "COMPLETED").status).toBe("COMPLETED");
    expect(view({}, "PROCESSING").status).toBe("RUNNING");
    expect(view({}, "QUEUED").status).toBe("QUEUED");
  });
});
