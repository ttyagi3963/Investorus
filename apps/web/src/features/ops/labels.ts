// The words and tones the operations console uses (T342): delivery statuses, targets, and events,
// the timeline's outcomes, the outage modes, and a criterion's expected and actual values in plain
// words, so a match explanation never shows raw codes or JSON.
import type { CriterionKey } from "@clever/contracts/buy-box";
import type { DeliveryStatus, DeliveryTarget } from "@clever/contracts/events";
import type { SimulationMode, SimulationService, TimelineEntry } from "@clever/contracts/ops";
import type { StatusTone } from "@clever/ui";
import {
  CONDITION_LABELS,
  PROGRAM_LABELS,
  PROPERTY_TYPE_LABELS,
  formatUsd,
} from "../listing-package/labels";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Pending",
  SENDING: "Sending",
  SENT: "Sent",
  RETRYING: "Retrying",
  NEEDS_ATTENTION: "Needs attention",
};

export const DELIVERY_STATUS_TONES: Record<DeliveryStatus, StatusTone> = {
  PENDING: "open",
  SENDING: "open",
  SENT: "under-contract",
  RETRYING: "offers-in",
  NEEDS_ATTENTION: "error",
};

export const TARGET_LABELS: Record<DeliveryTarget, string> = {
  EMAIL: "Email",
  SMS: "Text",
  CRM: "CRM",
};

const EVENT_LABELS: Record<string, string> = {
  "investor.notice": "Investor notice",
  "investor.match_digest": "Daily digest",
  "package.status_changed": "Status change",
  "offer.submitted": "New offer",
};
export const eventLabel = (eventType: string) => EVENT_LABELS[eventType] ?? eventType;

type Outcome = TimelineEntry["outcome"];
export const OUTCOME_LABELS: Record<Outcome, string> = {
  ...DELIVERY_STATUS_LABELS,
  SUCCESS: "Done",
  REJECTED: "Refused",
};
export const OUTCOME_TONES: Record<Outcome, StatusTone> = {
  ...DELIVERY_STATUS_TONES,
  SUCCESS: "under-contract",
  REJECTED: "error",
};

export const SERVICE_LABELS: Record<SimulationService, string> = {
  crm: "CRM",
  messaging: "Email and SMS",
  storage: "File storage",
};

export const MODE_LABELS: Record<SimulationMode, { label: string; description: string }> = {
  up: { label: "Up", description: "Works normally." },
  down: { label: "Down", description: "Answers every call with 503 Service Unavailable." },
  slow: { label: "Slow", description: "Waits 10 seconds before answering." },
  garbage: { label: "Garbage", description: "Answers with malformed data." },
};

export const MODE_TONES: Record<SimulationMode, StatusTone> = {
  up: "under-contract",
  down: "error",
  slow: "offers-in",
  garbage: "error",
};

const CODE_LABELS: Record<string, string> = {
  ...PROPERTY_TYPE_LABELS,
  ...CONDITION_LABELS,
  ...PROGRAM_LABELS,
};
const MONEY_KEYS: ReadonlySet<CriterionKey> = new Set(["price", "repair"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function formatScalar(key: CriterionKey, value: unknown): string {
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) return formatUsd(value);
    return key === "yearBuilt" ? String(value) : value.toLocaleString("en-US");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) {
      return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
    }
    return CODE_LABELS[value] ?? value;
  }
  return JSON.stringify(value);
}

/** A criterion's expected or actual value in words: "Any", a list, a range, or a single value. */
export function formatCriterionValue(
  key: CriterionKey,
  value: unknown,
  side: "expected" | "actual",
) {
  if (value === null || value === undefined) return side === "expected" ? "Any" : "Not given";
  if (key === "listedStatus") {
    const listed = typeof value === "object" ? (value as { listed: boolean }).listed : value;
    return listed ? "Listed for sale" : "Not listed";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "None" : value.map((item) => formatScalar(key, item)).join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("closeBy" in record) return `Closes by ${formatScalar(key, record.closeBy)}`;
    if ("min" in record || "max" in record) {
      const min = record.min ?? null;
      const max = record.max ?? null;
      if (min !== null && max !== null) {
        return `${formatScalar(key, min)} to ${formatScalar(key, max)}`;
      }
      if (min !== null) return `At least ${formatScalar(key, min)}`;
      if (max !== null) return `At most ${formatScalar(key, max)}`;
      return "Any";
    }
  }
  return formatScalar(key, value);
}
