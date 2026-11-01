// The audit port (T282; constitution XII): appends one domain audit entry in the change's own
// transaction. The adapter adds the time and the trace ID; `details` must never carry PII.
import type { AuditAction, AuditActorType, AuditOutcome } from "@clever/contracts/audit";

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
}
