// The legacy investor import (T322; FR-061, contracts/investor-import.md). Operations ask where to
// upload the CSV, the browser uploads it straight to storage, and `start` records a batch and
// queues IMPORT_INVESTORS. The job reads the file and handles each row in its own change: a valid
// row creates or updates the investor and their one default box (a changed box gets a new version
// and is matched, an unchanged one is left alone); an invalid one is recorded with its reason. A
// retried job skips the rows already done. Only operations import (FR-080).
import { randomUUID } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import {
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@clever/contracts/common";
import {
  MAX_IMPORT_BYTES,
  importUploadRequestSchema,
  startImportSchema,
  type ImportBatch,
  type ImportRowResult,
} from "@clever/contracts/investor";
import type { ImportInvestorsPayload, JobStatus } from "@clever/contracts/jobs";
import type { UploadInstruction } from "@clever/contracts/photo";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IGeoProvider } from "../../providers/geo/IGeoProvider.js";
import type { IStorageProvider } from "../../providers/storage/IStorageProvider.js";
import { keepVersionAndMatch, matchingTermsOf } from "../../services/buy-box/keep-version.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { FileRefusedError, parseLegacyCsv, type ParsedRow } from "./parse-legacy-csv.js";

export type ImportBatchDetail = {
  batch: ImportBatch;
  rows: ImportRowResult[];
  jobStatus: JobStatus | null;
};

export interface IInvestorImportWorkflow {
  requestUpload(
    actor: Actor,
    input: unknown,
  ): Promise<{ storageKey: string; upload: UploadInstruction }>;
  start(actor: Actor, input: unknown): Promise<{ jobId: string; batchId: string }>;
  run(job: ImportInvestorsPayload): Promise<void>;
  getBatch(actor: Actor, batchId: string): Promise<ImportBatchDetail>;
}

const CSV = "text/csv";

function assertOps(actor: Actor) {
  if (actor.role !== "OPS") throw new ForbiddenError("Only operations import investors");
}

export class InvestorImportWorkflow implements IInvestorImportWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { storage: IStorageProvider; geo: IGeoProvider; clock: IClock },
  ) {}

  async requestUpload(actor: Actor, input: unknown) {
    assertOps(actor);
    const { sizeBytes } = importUploadRequestSchema.parse(input);
    const storageKey = `imports/${randomUUID()}.csv`;
    return { storageKey, upload: await this.deps.storage.createUpload(storageKey, CSV, sizeBytes) };
  }

  async start(actor: Actor, input: unknown) {
    assertOps(actor);
    const { storageKey, fileName } = startImportSchema.parse(input);
    const stored = await this.deps.storage.stat(storageKey);
    if (!stored) {
      throw new ValidationError("Upload the file first", [
        { field: "storageKey", message: "No file was uploaded under this key" },
      ]);
    }
    if (stored.sizeBytes > MAX_IMPORT_BYTES) {
      throw new ValidationError("The file is larger than 5 MB");
    }
    return this.uow.run(async (repos) => {
      const batch = await repos.imports.createBatch({
        fileName,
        storageKey,
        createdBy: actor.userId,
      });
      const payload: ImportInvestorsPayload = { batchId: batch.id };
      const job = await repos.jobs.enqueue({
        type: "IMPORT_INVESTORS",
        dedupeKey: `IMPORT_INVESTORS:${batch.id}`,
        payload,
      });
      await repos.imports.setJob(batch.id, job.id);
      return { jobId: job.id, batchId: batch.id };
    });
  }

  async run({ batchId }: ImportInvestorsPayload): Promise<void> {
    const found = await this.uow.run((repos) => repos.imports.findBatch(batchId));
    if (!found || found.batch.finishedAt) return;
    const { batch } = found;

    const file = await this.deps.storage.read(batch.storageKey);
    let parsed;
    try {
      if (!file) throw new FileRefusedError("The uploaded file is missing");
      parsed = parseLegacyCsv(file, this.deps.geo);
    } catch (err) {
      if (!(err instanceof FileRefusedError)) throw err;
      await this.finish(batch, { totalRows: null, ignoredColumns: [], error: err.message });
      return;
    }

    const done = await this.uow.run((repos) => repos.imports.doneRowNumbers(batchId));
    for (const row of parsed.rows) {
      if (done.has(row.rowNumber)) continue;
      try {
        await this.uow.run(async (repos) => {
          await repos.imports.addRowResult(batchId, await this.importRow(repos, row));
        });
      } catch (err) {
        // A row the database refuses (an email another investor has) leaves nothing behind.
        if (!(err instanceof DomainError)) throw err;
        const fields = (err.details?.fields ?? []) as { message: string }[];
        await this.uow.run((repos) =>
          repos.imports.addRowResult(batchId, {
            rowNumber: row.rowNumber,
            outcome: "REJECTED",
            investorId: null,
            reason: `row ${row.rowNumber}: ${fields[0]?.message ?? err.message}`,
          }),
        );
      }
    }
    await this.finish(batch, {
      totalRows: parsed.rows.length,
      ignoredColumns: parsed.ignoredColumns,
      error: null,
    });
  }

  async getBatch(actor: Actor, batchId: string): Promise<ImportBatchDetail> {
    assertOps(actor);
    const found = await this.uow.run((repos) => repos.imports.findBatch(batchId));
    if (!found) throw new NotFoundError("Import not found");
    return found;
  }

  private async importRow(repos: UnitOfWorkRepositories, row: ParsedRow): Promise<ImportRowResult> {
    const { rowNumber } = row;
    if (!row.ok) return { rowNumber, outcome: "REJECTED", investorId: null, reason: row.reason };

    const existing = await repos.investors.findIdForImport(
      row.investor.externalRef,
      row.investor.email,
    );
    const investorId = await repos.investors.save(existing, row.investor);
    const before = existing === null ? null : await repos.buyBoxes.findDefault(investorId);
    if (!before) {
      const box = await repos.buyBoxes.create(investorId, row.box, true);
      await keepVersionAndMatch(repos, box, { changed: true, createdBy: null });
    } else {
      // Only a changed box is saved, so a second import of the same file adds no version.
      const next = { ...before, ...row.box };
      if (matchingTermsOf(next) !== matchingTermsOf(before) || next.name !== before.name) {
        const box = await repos.buyBoxes.update(before.id, before.version, row.box);
        await keepVersionAndMatch(repos, box, {
          changed: matchingTermsOf(box) !== matchingTermsOf(before),
          createdBy: null,
        });
      }
    }
    return {
      rowNumber,
      outcome: existing === null ? "IMPORTED" : "UPDATED",
      investorId,
      reason: null,
    };
  }

  private async finish(
    batch: ImportBatch,
    result: { totalRows: number | null; ignoredColumns: string[]; error: string | null },
  ) {
    await this.uow.run(async (repos) => {
      const found = await repos.imports.findBatch(batch.id);
      const count = (outcome: ImportRowResult["outcome"]) =>
        found?.rows.filter((row) => row.outcome === outcome).length ?? 0;
      const counts = {
        imported: count("IMPORTED"),
        updated: count("UPDATED"),
        rejected: count("REJECTED"),
      };
      await repos.imports.finish(batch.id, {
        ...result,
        ...counts,
        finishedAt: this.deps.clock.now(),
      });
      await repos.audit.append({
        actorType: "SYSTEM",
        actorId: null,
        action: "IMPORT_COMPLETED",
        entityType: "ImportBatch",
        entityId: batch.id,
        outcome: "SUCCESS",
        details: { ...counts, totalRows: result.totalRows, refused: result.error !== null },
      });
    });
  }
}
