// The property types and conditions as `as const` lists (constitution V), matching the Prisma
// `PropertyType` and `PropertyCondition` enums.
export const PROPERTY_TYPES = [
  "SINGLE_FAMILY",
  "CONDO",
  "TOWNHOME",
  "MULTI_FAMILY",
  "MANUFACTURED",
  "LAND",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DISTRESSED"] as const;
export type PropertyCondition = (typeof PROPERTY_CONDITIONS)[number];
