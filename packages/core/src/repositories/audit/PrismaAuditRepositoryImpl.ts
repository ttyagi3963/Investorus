// The audit port over Prisma (T282): the only file with AuditLog queries. The entry records the
// trace ID of the request or job that wrote it, read from the trace context.
import type { AuditAction, AuditEntry } from "@clever/contracts/audit";
import type { Prisma } from "../../generated/prisma/client.js";
import { currentTraceId } from "../../infra/trace-context.js";
import type { IAuditRepository, NewAuditEntry } from "./IAuditRepository.js";

export class PrismaAuditRepositoryImpl implements IAuditRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async append({ details, ...entry }: NewAuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        ...entry,
        details: (details ?? {}) as Prisma.InputJsonObject,
        correlationId: currentTraceId() ?? null,
      },
    });
  }

  async listForEntity(entityType: string, entityId: string): Promise<AuditEntry[]> {
    const rows = await this.db.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: "desc" },
    });
    // `action` is text checked against AUDIT_ACTIONS when written; `details` is our own JSON.
    return rows.map((row) => ({
      ...row,
      action: row.action as AuditAction,
      details: row.details as Record<string, unknown>,
    }));
  }
}
