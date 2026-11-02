// The audit port (T282; constitution XII): appends one domain audit entry in the change's own
// transaction. The adapter adds the time and the trace ID; `details` must never carry PII.
import type {
  AuditAction,
  AuditActorType,
  AuditEntry,
  AuditOutcome,
} from "@clever/contracts/audit";

export type NewAuditEntry = {
  actorType: AuditActorType;
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  details?: Record<string, unknown>;
};

export interface IAuditRepository {
  append(entry: NewAuditEntry): Promise<void>;
  /** An entity's entries, newest first. */
  listForEntity(entityType: string, entityId: string): Promise<AuditEntry[]>;
  /**
   * The entity's newest entry of one action whose details hold every given value (T396), read
   * without loading the rest of its history.
   */
  findLatest(
    entityType: string,
    entityId: string,
    action: AuditAction,
    details: Record<string, string | number>,
  ): Promise<AuditEntry | null>;
}
