// The domain audit log's values (T282; constitution XII), shaped from the Prisma `AuditLog` model.
// The table stores `action` as text, so this list is where a new action is added.

export const AUDIT_ACTIONS = ["PACKAGE_CREATED", "PACKAGE_UPDATED"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_TYPES = ["USER", "SYSTEM"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_OUTCOMES = ["SUCCESS"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
