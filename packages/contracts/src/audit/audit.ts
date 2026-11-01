// The domain audit log's values (T282; constitution XII), shaped from the Prisma `AuditLog` model.
// The table stores `action` as text, so this list is where a new action is added.

export const AUDIT_ACTIONS = ["PACKAGE_CREATED", "PACKAGE_UPDATED"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActorType = "USER" | "SYSTEM";

export type AuditOutcome = "SUCCESS";
