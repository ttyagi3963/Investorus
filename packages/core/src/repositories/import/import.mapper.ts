// Maps the database's ImportBatch and ImportRowResult rows to the domain types, the only place the
// row types appear (constitution IV). The table's CHECK makes each row result one of the two
// shapes, so a row that is neither is a broken invariant and throws.
import type { ImportBatch, ImportRowResult } from "@clever/contracts/investor";
import type {
  ImportBatch as ImportBatchRow,
  ImportRowResult as ImportRowResultRow,
} from "../../generated/prisma/client.js";

export function toImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    fileName: row.fileName,
    storageKey: row.storageKey,
    jobId: row.jobId,
    totalRows: row.totalRows,
    imported: row.imported,
    updated: row.updated,
    rejected: row.rejected,
    ignoredColumns: row.ignoredColumns,
    error: row.error,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export function toImportRowResult(row: ImportRowResultRow): ImportRowResult {
  if (row.outcome === "REJECTED" && row.reason !== null) {
    return { rowNumber: row.rowNumber, outcome: "REJECTED", investorId: null, reason: row.reason };
  }
  if (row.outcome !== "REJECTED" && row.investorId !== null) {
    return {
      rowNumber: row.rowNumber,
      outcome: row.outcome,
      investorId: row.investorId,
      reason: null,
    };
  }
  throw new Error(`Import row ${row.id} breaks the outcome check`);
}
