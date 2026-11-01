// The Criterion Registry's definitions (T279; constitution XIX.3): one list of criterion keys,
// and for each its label and the listing fields it reads. Every other layer (the evaluator, and
// later the SQL pre-filter and the form) is a record over the same keys, so a criterion missing
// from any layer fails the build. MATERIAL_FIELDS comes from here, never from a hand-kept list.

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

export type CriterionDefinition = {
  /** Shown to investors and agents in match explanations. */
  label: string;
  listingFields: readonly ListingField[];
};

export const CRITERIA = {
  geography: { label: "Location", listingFields: ["zip", "state"] },
  propertyType: { label: "Property type", listingFields: ["propertyType"] },
  price: { label: "Price", listingFields: ["priceExpectationMax"] },
  yearBuilt: { label: "Year built", listingFields: ["yearBuilt"] },
  beds: { label: "Beds", listingFields: ["beds"] },
  baths: { label: "Baths", listingFields: ["baths"] },
  sqft: { label: "Square feet", listingFields: ["sqft"] },
  units: { label: "Units", listingFields: ["units"] },
  condition: { label: "Condition", listingFields: ["condition"] },
  repair: { label: "Repair budget", listingFields: ["repairEstimate"] },
  closingSpeed: {
    label: "Closing speed",
    listingFields: ["closingWindowStart", "closingWindowEnd"],
  },
  listedStatus: { label: "Already listed", listingFields: ["currentlyListed"] },
  programs: { label: "Offer programs", listingFields: ["eligiblePrograms"] },
} as const satisfies Record<CriterionKey, CriterionDefinition>;

/** Every listing field some criterion reads: editing one after publish re-runs matching. */
export const MATERIAL_FIELDS: readonly ListingField[] = [
  ...new Set(CRITERION_KEYS.flatMap((key) => CRITERIA[key].listingFields)),
];
