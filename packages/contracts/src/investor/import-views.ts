// What the api sends for an investor import (T323; contracts/api.md): where to upload the file, and
// the batch with every row's result. The status comes from the batch and its job: a refused file
// or a job that gave up is FAILED, a finished batch COMPLETED, and a running job RUNNING.
import type { JobStatus } from "../jobs/jobs.js";
import type { UploadInstruction } from "../photo/photo.js";
import type { ImportBatch, ImportRowResult } from "./import.js";

/** POST /ops/investor-imports/uploads → 201. */
export type ImportUploadView = { storageKey: string; upload: UploadInstruction };

export type ImportStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type ImportBatchView = {
  id: string;
  fileName: string;
  status: ImportStatus;
  totalRows: number | null;
  /** Rows done so far: the progress while the job runs. */
  processedRows: number;
  imported: number;
  updated: number;
  rejected: number;
  ignoredColumns: string[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  rows: ImportRowResult[];
};

function statusOf(batch: ImportBatch, jobStatus: JobStatus | null): ImportStatus {
  if (batch.error !== null || jobStatus === "FAILED") return "FAILED";
  if (batch.finishedAt !== null) return "COMPLETED";
  return jobStatus === "PROCESSING" ? "RUNNING" : "QUEUED";
}

export function toImportBatchView({
  batch,
  rows,
  jobStatus,
}: {
  batch: ImportBatch;
  rows: ImportRowResult[];
  jobStatus: JobStatus | null;
}): ImportBatchView {
  const failed = jobStatus === "FAILED" && batch.error === null;
  return {
    id: batch.id,
    fileName: batch.fileName,
    status: statusOf(batch, jobStatus),
    totalRows: batch.totalRows,
    processedRows: rows.length,
    imported: batch.imported,
    updated: batch.updated,
    rejected: batch.rejected,
    ignoredColumns: batch.ignoredColumns,
    error: failed ? "The import stopped before it finished. Upload the file again." : batch.error,
    createdAt: batch.createdAt.toISOString(),
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    rows,
  };
}
