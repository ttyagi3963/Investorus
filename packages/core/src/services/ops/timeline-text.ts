// The operations timeline's wording (T341; FR-073): one line per audit entry or delivery, saying
// what happened without seller details. Investors are named by their company.
import type { AuditEntry } from "@clever/contracts/audit";
import type { OpsDelivery } from "../../repositories/ops/IOpsQueryRepository.js";

const AUDIT_TEXT: Partial<Record<AuditEntry["action"], string>> = {
  PACKAGE_CREATED: "Package created",
  PACKAGE_UPDATED: "Package edited",
  PACKAGE_PUBLISHED: "Published by the agent",
  PACKAGE_WITHDRAWN: "Withdrawn by the agent",
  PACKAGE_REOPENED: "Reopened for a new round",
  MATCHING_COMPLETED: "Matching finished",
  OFFER_SUBMITTED: "Offer received",
  OFFER_REVISED: "Offer revised",
  OFFER_WITHDRAWN: "Offer withdrawn",
  OFFER_EXPIRED: "Offer expired",
  OFFER_ROUND_CLOSED: "Offer window closed",
  OFFER_DEADLINE_EXTENDED: "Offer deadline extended",
  DECISION_RECORDED: "Seller's decision recorded",
  COUNTER_ACCEPTED: "Counter-offer accepted",
  COUNTER_DECLINED: "Counter-offer declined",
  DEAL_MILESTONE: "Deal milestone reached",
  DEAL_FELL_THROUGH: "Deal fell through",
  BACKUP_PROMOTED: "Backup offer promoted",
  BACKUP_RECONFIRMED: "Backup reconfirmed",
  RECONFIRMATION_DECLINED: "Backup declined to reconfirm",
  PII_ACCESSED: "Seller details read",
};

/** The entry's line, or null for entries the timeline leaves out (one per matched investor). */
export function auditSummary(entry: AuditEntry, companies: Map<string, string>): string | null {
  if (entry.action === "MATCH_DECISION") return null;
  const details = entry.details as Record<string, unknown>;
  const base = AUDIT_TEXT[entry.action] ?? entry.action.toLowerCase().replaceAll("_", " ");
  if (entry.action === "MATCHING_COMPLETED") {
    return `${base}: ${String(details.matchedCount)} of ${String(details.candidates)} buy boxes matched`;
  }
  const investorId = typeof details.investorId === "string" ? details.investorId : null;
  const company = investorId ? companies.get(investorId) : undefined;
  return company ? `${base} (${company})` : base;
}

const TARGET_TEXT = { CRM: "CRM update", EMAIL: "Email", SMS: "Text" } as const;

export function deliverySummary(delivery: OpsDelivery, companies: Map<string, string>): string {
  const to = delivery.investorId
    ? ` to ${companies.get(delivery.investorId) ?? "an investor"}`
    : "";
  const tries = delivery.attempts === 1 ? "1 attempt" : `${delivery.attempts} attempts`;
  return `${TARGET_TEXT[delivery.target]}${to} (${tries})`;
}
