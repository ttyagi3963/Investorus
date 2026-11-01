// The investor import's records (T319, FR-061), shaped from the Prisma `ImportBatch` and
// `ImportRowResult` models: one upload of the legacy file, and what happened to each of its rows.

export const IMPORT_ROW_OUTCOMES = ["IMPORTED", "UPDATED", "REJECTED"] as const;
export type ImportRowOutcome = (typeof IMPORT_ROW_OUTCOMES)[number];

export type ImportBatch = {
  id: string;
  fileName: string;
  storageKey: string;
  /** The IMPORT_INVESTORS job that reads the file. */
  jobId: string | null;
  /** Set once the file is read; null before, or when the whole file was refused. */
  totalRows: number | null;
  imported: number;
  updated: number;
  rejected: number;
  /** Columns in the file that the import does not know. */
  ignoredColumns: string[];
  /** Why the whole file was refused (too large, a missing column); null otherwise. */
  error: string | null;
  createdBy: string;
  createdAt: Date;
  finishedAt: Date | null;
};

/** A rejected row has a reason and no investor; an imported or updated one names its investor. */
export type ImportRowResult =
  | { rowNumber: number; outcome: "IMPORTED" | "UPDATED"; investorId: string; reason: null }
  | { rowNumber: number; outcome: "REJECTED"; investorId: null; reason: string };
