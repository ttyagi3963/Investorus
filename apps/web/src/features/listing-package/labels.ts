// The words the agent screens use for the package's codes (T301): offer programs, statuses, the
// fields a publish can be blocked by, and the timeline's actions. One place, so every screen says
// the same thing.
import type { AuditAction, TimelineEntryView } from "@clever/contracts/audit";
import type { OfferProgram, PackageStatus } from "@clever/contracts/listing-package";

export const PROGRAM_LABELS: Record<OfferProgram, string> = {
  CASH_OFFER: "Cash offer",
  CASH_WITH_UPSIDE: "Cash with upside",
  SEVEN_DAY_SOLD: "Sold in seven days",
};

export const STATUS_LABELS: Record<PackageStatus, string> = {
  DRAFT: "Draft",
  ACCEPTING_OFFERS: "Accepting offers",
  WITHDRAWN: "Withdrawn",
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
};

export const timelineText = (entry: TimelineEntryView) => ACTION_TEXT[entry.action](entry.details);
export const formatUsd = (value: number) => usd.format(value);
