// What operations see and change (T341; FR-071, FR-073–FR-075, FR-078, contracts/api.md): every
// package with its delivery trouble, one package's trace (who matched, what was sent and whether it
// arrived, offers, and the timeline), why an investor was or was not matched, the deliveries to
// retry, the CRM beside the platform, and the stand-in services' outage modes. Views carry the
// investor's company name, never a seller's details.
import { z } from "zod";
import type { CriterionKey } from "../buy-box/criteria.js";
import type { DeliveryStatus, DeliveryTarget } from "../events/events.js";
import { DELIVERY_STATUSES, DELIVERY_TARGETS } from "../events/events.js";
import type { PackageStatus } from "../listing-package/listing-package.js";
import type { OfferStatus } from "../offer/offer.js";

/** How many of a package's deliveries are in each unfinished state. */
export type DeliveryCounts = { pending: number; retrying: number; needsAttention: number };

export type OpsPackageRow = {
  id: string;
  status: PackageStatus;
  streetLine: string;
  city: string;
  state: string;
  zip: string;
  round: number;
  matchedCount: number;
  offerCount: number;
  deliveries: DeliveryCounts;
  updatedAt: string;
};

export type TimelineEntry = {
  occurredAt: string;
  kind: "audit" | "delivery";
  /** What happened, in words, with no seller details. */
  summary: string;
  outcome: "SUCCESS" | "REJECTED" | DeliveryStatus;
  /** Who did it: a role, or "System". */
  actor: string;
};

export type TraceInvestor = {
  investorId: string;
  companyName: string;
  buyBoxes: { id: string; name: string; version: number }[];
  /** The email for the investor's match notice; null when none was sent (a buy-box-change match). */
  notification: { status: DeliveryStatus; lastError: string | null } | null;
  offer: { status: OfferStatus; price: number } | null;
};

export type PackageTrace = {
  package: {
    id: string;
    status: PackageStatus;
    streetLine: string;
    city: string;
    state: string;
    zip: string;
    round: number;
    listingVersion: number;
    offerDeadline: string | null;
  };
  stats: {
    /** Buy boxes the last matching run considered; null before the package was matched. */
    evaluated: number | null;
    matched: number;
    delivered: number;
    needsAttention: number;
    offers: number;
  };
  matched: TraceInvestor[];
  /** Active investors the package did not match this round, for "Why not matched?". */
  excluded: { investorId: string; companyName: string }[];
  timeline: TimelineEntry[];
};

export type CriterionCheck = {
  key: CriterionKey;
  label: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
};

export type MatchExplanation = {
  investorId: string;
  matched: boolean;
  listingVersion: number;
  /** STORED: the decision kept when matching ran. REPLAYED: re-evaluated now for a non-match. */
  source: "STORED" | "REPLAYED";
  /** The matching rules changed since the package was matched, so a replay may differ. */
  replayedWithNewerRules: boolean;
  buyBoxes: {
    buyBoxId: string;
    name: string;
    version: number;
    /** False for a box that was paused then: a paused box matches nothing, whatever its criteria. */
    active: boolean;
    matched: boolean;
    criteria: CriterionCheck[];
  }[];
};

export type DeliveryView = {
  id: string;
  target: DeliveryTarget;
  /** The investor's company, or "CRM". */
  recipient: string;
  packageId: string | null;
  eventType: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
};

export const deliveryListQuerySchema = z.object({ status: z.enum(DELIVERY_STATUSES).optional() });
/** Retry every delivery set aside, or only one target's, or only one package's. */
export const retryAllInputSchema = z.object({
  target: z.enum(DELIVERY_TARGETS).optional(),
  packageId: z.string().min(1).optional(),
});
export type RetryAllInput = z.infer<typeof retryAllInputSchema>;

export type CrmComparisonRow = {
  packageId: string;
  streetLine: string;
  platformStatus: PackageStatus;
  crmStatus: string | null;
  inSync: boolean;
  /** The newest CRM delivery not yet sent, which explains a difference (FR-078). */
  pendingDelivery: { id: string; status: DeliveryStatus } | null;
};

export const SIMULATION_SERVICES = ["crm", "messaging", "storage"] as const;
export type SimulationService = (typeof SIMULATION_SERVICES)[number];
export const SIMULATION_MODES = ["up", "down", "slow", "garbage"] as const;
export type SimulationMode = (typeof SIMULATION_MODES)[number];
export type SimulationModes = Record<SimulationService, SimulationMode>;
export const simulationInputSchema = z.object({ mode: z.enum(SIMULATION_MODES) });
