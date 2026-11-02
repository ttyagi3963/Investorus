// The words the screens use for the codes (T301, T315, T324): offer programs, property types and
// conditions, package, offer, and deal statuses, an offer's payment types and contingencies, the
// fields a publish can be blocked by, and the timeline's actions. One place, so every screen says
// the same thing.
import type { AuditAction, TimelineEntryView } from "@clever/contracts/audit";
import type { DealStatus } from "@clever/contracts/deal";
import type { OfferProgram, PackageStatus } from "@clever/contracts/listing-package";
import { CONTINGENCIES, type OfferStatus } from "@clever/contracts/offer";
import type { PropertyCondition, PropertyType } from "@clever/contracts/property";

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  SINGLE_FAMILY: "Single family",
  CONDO: "Condo",
  TOWNHOME: "Townhome",
  MULTI_FAMILY: "Multi-family",
  MANUFACTURED: "Manufactured",
  LAND: "Land",
};

export const CONDITION_LABELS: Record<PropertyCondition, string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  DISTRESSED: "Distressed",
};

export const PROGRAM_LABELS: Record<OfferProgram, string> = {
  CASH_OFFER: "Cash offer",
  CASH_WITH_UPSIDE: "Cash with upside",
  SEVEN_DAY_SOLD: "Sold in seven days",
};

export const STATUS_LABELS: Record<PackageStatus, string> = {
  DRAFT: "Draft",
  ACCEPTING_OFFERS: "Accepting offers",
  NO_OFFERS_RECEIVED: "No offers received",
  OFFER_ACCEPTED: "Offer accepted",
  UNDER_CONTRACT: "Under contract",
  INSPECTION: "Inspection",
  CLOSING: "Closing",
  CLOSED: "Closed",
  FELL_THROUGH: "Fell through",
  WITHDRAWN: "Withdrawn",
};

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  ACTIVE: "Active",
  COUNTERED: "Countered",
  BACKUP: "Backup offer",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  FELL_THROUGH: "Fell through",
  DECLINED_TO_RECONFIRM: "Declined to reconfirm",
};

/** The choices an offer form and a counter offer for how the price is paid and its conditions. */
export const PAYMENT_TYPE_OPTIONS = [
  { id: "CASH", label: "Cash" },
  { id: "FINANCED", label: "Financed" },
];
export const CONTINGENCY_OPTIONS = CONTINGENCIES.map((id) => ({
  id,
  label: id.charAt(0) + id.slice(1).toLowerCase().replaceAll("_", " "),
}));

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  PENDING_RECONFIRMATION: "Waiting for the backup to reconfirm",
  OFFER_ACCEPTED: "Offer accepted",
  UNDER_CONTRACT: "Under contract",
  INSPECTION: "Inspection",
  CLOSING: "Closing",
  CLOSED: "Closed",
  FELL_THROUGH: "Fell through",
  RECONFIRM_DECLINED: "Backup did not reconfirm",
};

/** The fields a publish names, by api field path. */
export const FIELD_LABELS: Record<string, string> = {
  photos: "Photos",
  offerDeadline: "Offer deadline",
  closingWindowStart: "Closing window start",
  closingWindowEnd: "Closing window end",
  currentlyListed: "Listed for sale now",
  eligiblePrograms: "Offer programs",
  "property.beds": "Beds",
  "property.baths": "Baths",
  "property.sqft": "Square feet",
  "property.lotSqft": "Lot square feet",
  "property.units": "Units",
  "property.yearBuilt": "Year built",
  "property.condition": "Condition",
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const ACTION_TEXT: Record<AuditAction, (details: Record<string, unknown>) => string> = {
  PACKAGE_CREATED: () => "Draft created",
  PACKAGE_UPDATED: (d) =>
    d.listingVersion ? `Edited; investors were sent version ${String(d.listingVersion)}` : "Edited",
  PACKAGE_PUBLISHED: () => "Published",
  PACKAGE_WITHDRAWN: (d) =>
    `Withdrawn${d.declinedOffers ? `; ${String(d.declinedOffers)} open offer(s) declined` : ""}`,
  MATCH_DECISION: () => "Matched an investor",
  MATCHING_COMPLETED: (d) => {
    const count = Number(d.matchedCount ?? 0);
    return `Matched ${count} investor${count === 1 ? "" : "s"}`;
  },
  OFFER_SUBMITTED: (d) => `Offer received: ${usd.format(Number(d.price))}`,
  OFFER_REVISED: (d) => `Offer revised to ${usd.format(Number(d.price))}`,
  OFFER_WITHDRAWN: () => "An investor withdrew their offer",
  OFFER_EXPIRED: () => "An offer expired",
  OFFER_ROUND_CLOSED: (d) => {
    const count = Number(d.openOffers ?? 0);
    return `Offer deadline passed with ${count} open offer${count === 1 ? "" : "s"}`;
  },
  OFFER_DEADLINE_EXTENDED: () => "Offer deadline extended",
  PACKAGE_REOPENED: (d) => `Reopened for offer round ${String(d.round)}`,
  DECISION_RECORDED: (d) =>
    d.type === "ACCEPT"
      ? "Offer accepted"
      : d.type === "COUNTER"
        ? "Counter-offer sent"
        : "All open offers declined",
  COUNTER_ACCEPTED: () => "The investor accepted the counter-offer",
  COUNTER_DECLINED: () => "The investor declined the counter-offer",
  BACKUP_EXTENDED: () => "A backup offer's expiry was extended",
  DEAL_MILESTONE: (d) =>
    `Deal moved to ${STATUS_LABELS[d.milestone as PackageStatus] ?? String(d.milestone)}`,
  DEAL_FELL_THROUGH: () => "The deal fell through",
  BACKUP_PROMOTED: () => "A backup offer was promoted; waiting for the investor to reconfirm",
  BACKUP_RECONFIRMED: () => "The backup investor reconfirmed; the offer is accepted",
  RECONFIRMATION_DECLINED: (d) =>
    d.timedOut
      ? "The backup investor did not reconfirm in time"
      : "The backup investor declined to reconfirm",
  PII_ACCESSED: () => "The buyer viewed the seller's contact details",
  BUY_BOX_SAVED: () => "A buy box was saved",
  IMPORT_COMPLETED: () => "An investor import finished",
  MATCH_DIGESTS_SENT: () => "The daily match digest went out",
  DELIVERY_RETRIED: () => "Operations retried a delivery",
  SIMULATION_CHANGED: () => "Operations changed a simulated outage",
  BRAND_THEME_UPDATED: () => "Operations changed a brand's theme",
};

export const timelineText = (entry: TimelineEntryView) => ACTION_TEXT[entry.action](entry.details);
export const formatUsd = (value: number) => usd.format(value);
