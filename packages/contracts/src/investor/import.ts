// The investor import's records (T319, FR-061), shaped from the Prisma `ImportBatch` and
// `ImportRowResult` models: one upload of the legacy file, and what happened to each of its rows;
// and its inputs (T322): asking where to upload the file, then starting the import of it.
import { z } from "zod";

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

/** The most a legacy file may hold (contracts/investor-import.md). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** POST /ops/investor-imports/uploads: the size of the CSV the browser will upload. */
export const importUploadRequestSchema = z.object({
  sizeBytes: z.number().int().positive().max(MAX_IMPORT_BYTES, "The file is larger than 5 MB"),
});

/** POST /ops/investor-imports: the uploaded file to import. */
export const startImportSchema = z.object({
  storageKey: z.string().startsWith("imports/"),
  fileName: z.string().trim().min(1).max(200),
});

/** A rejected row has a reason and no investor; an imported or updated one names its investor. */
export type ImportRowResult =
  | { rowNumber: number; outcome: "IMPORTED" | "UPDATED"; investorId: string; reason: null }
  | { rowNumber: number; outcome: "REJECTED"; investorId: null; reason: string };
