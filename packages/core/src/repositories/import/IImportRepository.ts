// The investor import port (T322; FR-061): a batch for each uploaded file, and one result per row.
// A row result is written in the same change as the row's investor and box, so a retried job
// knows which rows are done; the counts are taken from the results when the batch finishes.
import type { ImportBatch, ImportRowResult } from "@clever/contracts/investor";
import type { JobStatus } from "@clever/contracts/jobs";

export type NewImportBatch = Pick<ImportBatch, "fileName" | "storageKey" | "createdBy">;

/** How a batch ends: the counts and ignored columns, or why the whole file was refused. */
export type ImportBatchFinish = Pick<
  ImportBatch,
  "totalRows" | "imported" | "updated" | "rejected" | "ignoredColumns" | "error" | "finishedAt"
>;

export interface IImportRepository {
  createBatch(batch: NewImportBatch): Promise<ImportBatch>;
  /** Links the batch to the job that reads its file. */
  setJob(batchId: string, jobId: string): Promise<void>;
  /** The batch, its row results in row order, and the status of its job. */
  findBatch(
    batchId: string,
  ): Promise<{ batch: ImportBatch; rows: ImportRowResult[]; jobStatus: JobStatus | null } | null>;
  /** The rows already done, so a retried job skips them. */
  doneRowNumbers(batchId: string): Promise<Set<number>>;
  addRowResult(batchId: string, result: ImportRowResult): Promise<void>;
  finish(batchId: string, finish: ImportBatchFinish): Promise<void>;
}
