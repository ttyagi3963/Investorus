// The domain audit log (T282; constitution XII), shaped from the Prisma `AuditLog` model, and the
// package timeline the agent sees (T297). The table stores `action` as text, so this list is where
// a new action is added.

export const AUDIT_ACTIONS = [
  "PACKAGE_CREATED",
  "PACKAGE_UPDATED",
  "PACKAGE_PUBLISHED",
  "PACKAGE_WITHDRAWN",
  "MATCH_DECISION",
  "MATCHING_COMPLETED",
  "OFFER_SUBMITTED",
  "OFFER_REVISED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActorType = "USER" | "SYSTEM";

export type AuditOutcome = "SUCCESS";

export type AuditEntry = {
  id: string;
  occurredAt: Date;
  actorType: AuditActorType;
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  outcome: AuditOutcome;
  correlationId: string | null;
  /** Never PII. */
  details: Record<string, unknown>;
};

/** One line of a package's timeline (GET /listing-packages/:id/timeline). */
export type TimelineEntryView = {
  id: string;
  action: AuditAction;
  occurredAt: string;
  details: Record<string, unknown>;
};

export function toTimelineEntryView(entry: AuditEntry): TimelineEntryView {
  return {
    id: entry.id,
    action: entry.action,
    occurredAt: entry.occurredAt.toISOString(),
    details: entry.details,
  };
}
