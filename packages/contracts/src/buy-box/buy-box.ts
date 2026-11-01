// The BuyBox the app passes around, shaped from the Prisma `BuyBox` and `BuyBoxGeography` models
// (T279), with baths as numbers. Every criterion is null for "any" (FR-025). A plain type: buy
// boxes come from our own database, whose CHECKs enforce the value rules.
import type { OfferProgram } from "../listing-package/programs.js";
import type { PropertyCondition, PropertyType } from "../property/enums.js";

export const BUY_BOX_STATUSES = ["ACTIVE", "PAUSED"] as const;
export type BuyBoxStatus = (typeof BUY_BOX_STATUSES)[number];

export const BUY_BOX_STRATEGIES = [
  "FIX_FLIP",
  "BUY_HOLD",
  "WHOLESALE",
  "NOVATION",
  "SELLER_FINANCE",
] as const;
export type BuyBoxStrategy = (typeof BUY_BOX_STRATEGIES)[number];

export const GEOGRAPHY_MODES = ["NATIONWIDE", "STATES", "ZIPS"] as const;
export type GeographyMode = (typeof GEOGRAPHY_MODES)[number];

export type BuyBox = {
  id: string;
  investorId: string;
  name: string;
  status: BuyBoxStatus;
  isDefault: boolean;
  /** A label for organizing; not a criterion. */
  strategy: BuyBoxStrategy | null;
  geographyMode: GeographyMode;
  /** The two-letter states (STATES) or five-digit ZIPs (ZIPS) covered; empty for NATIONWIDE. */
  geography: string[];
  propertyTypes: PropertyType[] | null;
  priceMin: number | null;
  priceMax: number | null;
  yearBuiltMin: number | null;
  yearBuiltMax: number | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  unitsMin: number | null;
  unitsMax: number | null;
  conditionsAccepted: PropertyCondition[] | null;
  repairMax: number | null;
  closeWithinDays: number | null;
  /** false: only homes that are not already listed. */
  acceptsListed: boolean;
  programsAccepted: OfferProgram[] | null;
  version: number;
};
