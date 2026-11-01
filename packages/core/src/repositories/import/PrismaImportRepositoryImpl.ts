// The investor import port over Prisma (T322): the only file with ImportBatch and ImportRowResult
// queries.
import type { ImportBatch, ImportRowResult } from "@clever/contracts/investor";
import type { JobStatus } from "@clever/contracts/jobs";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IImportRepository, ImportBatchFinish, NewImportBatch } from "./IImportRepository.js";
import { toImportBatch, toImportRowResult } from "./import.mapper.js";

export class PrismaImportRepositoryImpl implements IImportRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async createBatch(batch: NewImportBatch): Promise<ImportBatch> {
    return toImportBatch(await this.db.importBatch.create({ data: batch }));
  }

  async setJob(batchId: string, jobId: string): Promise<void> {
    await this.db.importBatch.update({ where: { id: batchId }, data: { jobId } });
  }

  async findBatch(batchId: string) {
    const row = await this.db.importBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: { rowNumber: "asc" } }, job: { select: { status: true } } },
    });
    if (!row) return null;
    const jobStatus: JobStatus | null = row.job?.status ?? null;
    return { batch: toImportBatch(row), rows: row.rows.map(toImportRowResult), jobStatus };
  }

  async doneRowNumbers(batchId: string): Promise<Set<number>> {
    const rows = await this.db.importRowResult.findMany({
      where: { batchId },
      select: { rowNumber: true },
    });
    return new Set(rows.map((row) => row.rowNumber));
  }

  async addRowResult(batchId: string, result: ImportRowResult): Promise<void> {
    await this.db.importRowResult.create({ data: { batchId, ...result } });
  }

  async finish(batchId: string, finish: ImportBatchFinish): Promise<void> {
    await this.db.importBatch.update({ where: { id: batchId }, data: finish });
  }
}
