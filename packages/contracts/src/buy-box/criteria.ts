// The Criterion Registry's definitions (T279, T320; constitution XIX.3): one list of criterion
// keys, and for each its label, the listing fields it reads, the buy box fields it owns with their
// rules, and how the editor shows it. Every other layer (the evaluator, the SQL pre-filter, the
// form, the import) is a record over the same keys, so a criterion missing from any layer fails the
// build. MATERIAL_FIELDS and the buy box input schema come from here, never from hand-kept lists.
import { z } from "zod";
import { OFFER_PROGRAMS } from "../listing-package/programs.js";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "../property/enums.js";
import { GEOGRAPHY_MODES } from "./buy-box.js";
import { US_STATE_CODES } from "./states.js";

export const CRITERION_KEYS = [
  "geography",
  "propertyType",
  "price",
  "yearBuilt",
  "beds",
  "baths",
  "sqft",
  "units",
  "condition",
  "repair",
  "closingSpeed",
  "listedStatus",
  "programs",
] as const;
export type CriterionKey = (typeof CRITERION_KEYS)[number];

/** The listing facts a criterion can read (all of them free of seller PII). */
export type ListingField =
  | "zip"
  | "state"
  | "propertyType"
  | "priceExpectationMax"
  | "yearBuilt"
  | "beds"
  | "baths"
  | "sqft"
  | "units"
  | "condition"
  | "repairEstimate"
  | "closingWindowStart"
  | "closingWindowEnd"
  | "currentlyListed"
  | "eligiblePrograms";

/** A refusal of a rule across a criterion's fields, naming the field to fix. */
export type CriterionIssue = { field: string; message: string };

/** How the buy box editor shows a criterion. */
export type CriterionForm =
  | { kind: "geography" }
  | { kind: "range"; min: string; max: string; minLabel: string; maxLabel: string; usd?: true }
  | { kind: "limit"; field: string; label: string; usd?: true }
  | { kind: "choices"; field: string; options: readonly string[] }
  | { kind: "toggle"; field: string; label: string };

export type CriterionDefinition = {
  /** Shown to investors and agents in match explanations, and as the editor's section title. */
  label: string;
  listingFields: readonly ListingField[];
  /** The buy box fields this criterion owns, each null for "any" unless it says otherwise. */
  fields: z.ZodRawShape;
  /** A rule across the criterion's own fields (min ≤ max, geography agreeing with its mode). */
  check?: (box: Record<string, unknown>) => CriterionIssue | null;
  form: CriterionForm;
};

const whole = (min: number, max?: number) => {
  const atLeast = z.number().int("Use a whole number").min(min, `Must be ${min} or more`);
  return max === undefined ? atLeast : atLeast.max(max, `Must be ${max} or less`);
};

/** A min and a max, each optional; when both are set, min must not be above max. */
function range<Min extends string, Max extends string>(
  min: Min,
  max: Max,
  value: z.ZodNumber,
  labels: { min: string; max: string },
  usd?: true,
) {
  return {
    fields: { [min]: value.nullable(), [max]: value.nullable() } as Record<
      Min | Max,
      z.ZodNullable<z.ZodNumber>
    >,
    check: (box: Record<string, unknown>): CriterionIssue | null => {
      const [low, high] = [box[min], box[max]];
      return typeof low === "number" && typeof high === "number" && low > high
        ? { field: min, message: `${labels.min} must not be above ${labels.max.toLowerCase()}` }
        : null;
    },
    form: {
      kind: "range" as const,
      min,
      max,
      minLabel: labels.min,
      maxLabel: labels.max,
      ...(usd && { usd }),
    },
  };
}

/** A list of accepted values; "any" is blank (null), so an empty list is refused. */
const choices = <T extends readonly [string, ...string[]]>(options: T) =>
  z.array(z.enum(options)).min(1, "Choose at least one, or leave it blank for any").nullable();

function geographyIssue(box: Record<string, unknown>): CriterionIssue | null {
  const places = box.geography as string[];
  const issue = (message: string) => ({ field: "geography", message });
  switch (box.geographyMode) {
    case "NATIONWIDE":
      return places.length > 0 ? issue("A nationwide box lists no states or ZIP codes") : null;
    case "STATES": {
      if (places.length === 0) return issue("Add at least one state");
      const bad = places.find((code) => !(US_STATE_CODES as readonly string[]).includes(code));
      return bad === undefined ? null : issue(`${bad} is not a US state code`);
    }
    default: {
      if (places.length === 0) return issue("Add at least one ZIP code");
      const bad = places.find((zip) => !/^\d{5}$/.test(zip));
      return bad === undefined ? null : issue(`${bad} is not a 5-digit ZIP code`);
    }
  }
}

export const CRITERIA = {
  geography: {
    label: "Location",
    listingFields: ["zip", "state"],
    fields: {
      geographyMode: z.enum(GEOGRAPHY_MODES),
      /** The states (STATES) or ZIP codes (ZIPS) covered; empty for NATIONWIDE. */
      geography: z.array(z.string().trim().toUpperCase()),
    },
    check: geographyIssue,
    form: { kind: "geography" },
  },
  propertyType: {
    label: "Property type",
    listingFields: ["propertyType"],
    fields: { propertyTypes: choices(PROPERTY_TYPES) },
    form: { kind: "choices", field: "propertyTypes", options: PROPERTY_TYPES },
  },
  price: {
    label: "Price",
    listingFields: ["priceExpectationMax"],
    ...range("priceMin", "priceMax", whole(0), { min: "Min price", max: "Max price" }, true),
  },
  yearBuilt: {
    label: "Year built",
    listingFields: ["yearBuilt"],
    ...range(
      "yearBuiltMin",
      "yearBuiltMax",
      // Up to next year: a home can be sold before it is finished.
      whole(1800).refine(
        (year) => year <= new Date().getUTCFullYear() + 1,
        "Must not be after next year",
      ),
      { min: "Min year built", max: "Max year built" },
    ),
  },
  beds: {
    label: "Beds",
    listingFields: ["beds"],
    ...range("bedsMin", "bedsMax", whole(0, 20), { min: "Min beds", max: "Max beds" }),
  },
  baths: {
    label: "Baths",
    listingFields: ["baths"],
    ...range(
      "bathsMin",
      "bathsMax",
      z
        .number()
        .min(0, "Must be 0 or more")
        .max(20, "Must be 20 or less")
        // The column keeps one decimal place, so 2.25 would be stored as 2.3.
        .refine((baths) => Number.isInteger(baths * 10), "Use at most one decimal place"),
      { min: "Min baths", max: "Max baths" },
    ),
  },
  sqft: {
    label: "Square feet",
    listingFields: ["sqft"],
    ...range("sqftMin", "sqftMax", whole(1), { min: "Min square feet", max: "Max square feet" }),
  },
  units: {
    label: "Units",
    listingFields: ["units"],
    ...range("unitsMin", "unitsMax", whole(2, 500), { min: "Min units", max: "Max units" }),
  },
  condition: {
    label: "Condition",
    listingFields: ["condition"],
    fields: { conditionsAccepted: choices(PROPERTY_CONDITIONS) },
    form: { kind: "choices", field: "conditionsAccepted", options: PROPERTY_CONDITIONS },
  },
  repair: {
    label: "Repair budget",
    listingFields: ["repairEstimate"],
    fields: { repairMax: whole(0).nullable() },
    form: { kind: "limit", field: "repairMax", label: "Max repairs", usd: true },
  },
  closingSpeed: {
    label: "Closing speed",
    listingFields: ["closingWindowStart", "closingWindowEnd"],
    fields: { closeWithinDays: whole(7, 120).nullable() },
    form: { kind: "limit", field: "closeWithinDays", label: "Can close within (days)" },
  },
  listedStatus: {
    label: "Already listed",
    listingFields: ["currentlyListed"],
    /** Not nullable: false means only homes that are not already listed. */
    fields: { acceptsListed: z.boolean() },
    form: {
      kind: "toggle",
      field: "acceptsListed",
      label: "Include homes already listed for sale",
    },
  },
  programs: {
    label: "Offer programs",
    listingFields: ["eligiblePrograms"],
    fields: { programsAccepted: choices(OFFER_PROGRAMS) },
    form: { kind: "choices", field: "programsAccepted", options: OFFER_PROGRAMS },
  },
} as const satisfies Record<CriterionKey, CriterionDefinition>;

/** Every listing field some criterion reads: editing one after publish re-runs matching. */
export const MATERIAL_FIELDS: readonly ListingField[] = [
  ...new Set(CRITERION_KEYS.flatMap((key) => CRITERIA[key].listingFields)),
];
