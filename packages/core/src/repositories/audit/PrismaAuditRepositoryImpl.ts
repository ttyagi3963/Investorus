// The audit port over Prisma (T282): the only file with AuditLog queries. The entry records the
// trace ID of the request or job that wrote it, read from the trace context. Its details go through
// redactPii: an entry can never be changed or deleted, so a personal detail written there would stay.
import type { AuditAction, AuditEntry } from "@clever/contracts/audit";
import { redactPii } from "../../errors/redact-pii.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { currentTraceId } from "../../infra/trace-context.js";
import type { IAuditRepository, NewAuditEntry } from "./IAuditRepository.js";

export class PrismaAuditRepositoryImpl implements IAuditRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async append({ details, ...entry }: NewAuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        ...entry,
        details: redactPii(details ?? {}) as Prisma.InputJsonObject,
        correlationId: currentTraceId() ?? null,
      },
    });
  }

  async listForEntity(entityType: string, entityId: string): Promise<AuditEntry[]> {
    const rows = await this.db.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: "desc" },
    });
    return rows.map(toEntry);
  }

  async findLatest(
    entityType: string,
    entityId: string,
    action: AuditAction,
    details: Record<string, string | number>,
  ): Promise<AuditEntry | null> {
    const row = await this.db.auditLog.findFirst({
      where: {
        entityType,
        entityId,
        action,
        AND: Object.entries(details).map(([key, value]) => ({
          details: { path: [key], equals: value },
        })),
      },
      orderBy: { occurredAt: "desc" },
    });
    return row && toEntry(row);
  }
}

// `action` is text checked against AUDIT_ACTIONS when written; `details` is our own JSON.
const toEntry = (row: Prisma.AuditLogGetPayload<object>): AuditEntry => ({
  ...row,
  action: row.action as AuditAction,
  details: row.details as Record<string, unknown>,
});
