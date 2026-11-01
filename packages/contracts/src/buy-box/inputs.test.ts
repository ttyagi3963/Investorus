// Guards the buy box rules the registry owns (T320; FR-060, FR-025): every criterion can be left
// blank for "any", while a min above its max, an empty list, and a geography that disagrees with
// its mode are refused, each naming the field to fix.
import { describe, expect, it } from "vitest";
import { CRITERIA, CRITERION_KEYS, type CriterionDefinition } from "./criteria.js";
import { buyBoxInputSchema } from "./inputs.js";

const blank = {
  name: "Austin flips",
  strategy: null,
  status: "ACTIVE",
  geographyMode: "NATIONWIDE",
  geography: [],
  propertyTypes: null,
  priceMin: null,
  priceMax: null,
  yearBuiltMin: null,
  yearBuiltMax: null,
  bedsMin: null,
  bedsMax: null,
  bathsMin: null,
  bathsMax: null,
  sqftMin: null,
  sqftMax: null,
  unitsMin: null,
  unitsMax: null,
  conditionsAccepted: null,
  repairMax: null,
  closeWithinDays: null,
  acceptsListed: true,
  programsAccepted: null,
};

/** The fields and messages a refused box names. */
function refusal(box: Record<string, unknown>) {
  const result = buyBoxInputSchema.safeParse(box);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

const forms = CRITERION_KEYS.map((key) => (CRITERIA[key] as CriterionDefinition).form);

describe("buyBoxInputSchema", () => {
  it("accepts a box with every criterion left blank for any", () => {
    expect(buyBoxInputSchema.safeParse(blank).success).toBe(true);
  });

  it("refuses a min above its max for every range, naming the min field", () => {
    // A valid value for each field, the min above the max.
    const reversed: Record<string, [number, number]> = {
      priceMin: [300_000, 200_000],
      yearBuiltMin: [2000, 1990],
      bedsMin: [4, 2],
      bathsMin: [3, 2],
      sqftMin: [2000, 1000],
      unitsMin: [10, 4],
    };
    const ranges = forms.flatMap((form) => (form.kind === "range" ? [form] : []));
    expect(ranges.map((form) => form.min)).toEqual(Object.keys(reversed));
    for (const { min, max, minLabel } of ranges) {
      const [low, high] = reversed[min]!;
      expect(refusal({ ...blank, [min]: low, [max]: high })).toEqual([
        {
          field: min,
          message: expect.stringMatching(new RegExp(`^${minLabel} must not be above`)),
        },
      ]);
    }
  });

  it("refuses an empty list for every list criterion: any is blank", () => {
    const lists = forms.flatMap((form) => (form.kind === "choices" ? [form.field] : []));
    expect(lists).toHaveLength(3);
    for (const field of lists) {
      expect(refusal({ ...blank, [field]: [] })).toEqual([
        { field, message: "Choose at least one, or leave it blank for any" },
      ]);
    }
  });

  it("refuses a geography that disagrees with its mode", () => {
    const geography = (geographyMode: string, places: string[]) =>
      refusal({ ...blank, geographyMode, geography: places }).map((issue) => issue.message);
    expect(geography("NATIONWIDE", ["TX"])).toEqual([
      "A nationwide box lists no states or ZIP codes",
    ]);
    expect(geography("STATES", [])).toEqual(["Add at least one state"]);
    expect(geography("STATES", ["TX", "TZ"])).toEqual(["TZ is not a US state code"]);
    expect(geography("ZIPS", [])).toEqual(["Add at least one ZIP code"]);
    expect(geography("ZIPS", ["7870"])).toEqual(["7870 is not a 5-digit ZIP code"]);
  });
});
