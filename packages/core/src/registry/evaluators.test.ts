// Guards the matching rules (T286; constitution XIX, FR-020, FR-025): each criterion passes the
// listings it should and fails the rest; a null criterion means "any"; a listing value a set
// criterion needs that is missing fails it (fail closed); and a box matches only if every
// criterion passes.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { CriterionKey } from "@clever/contracts/buy-box";
import { describe, expect, it } from "vitest";
import { evaluateBuyBox } from "./evaluate-buy-box.js";
import type { ListingFacts } from "./listing-facts.js";

const TODAY = "2026-11-01";
const anyBox: BuyBox = {
  id: "box-1",
  investorId: "investor-1",
  name: "Austin flips",
  status: "ACTIVE",
  isDefault: false,
  strategy: null,
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
  version: 1,
};
const listing: ListingFacts = {
  zip: "78704",
  state: "TX",
  propertyType: "SINGLE_FAMILY",
  priceExpectationMax: 300_000,
  yearBuilt: 1985,
  beds: 3,
  baths: 2,
  sqft: 1_600,
  units: null,
  condition: "FAIR",
  repairEstimate: 25_000,
  closingWindowStart: "2026-11-20",
  closingWindowEnd: "2026-12-15",
  currentlyListed: false,
  eligiblePrograms: ["CASH_OFFER"],
};

/** For each criterion: a box setting it, a listing it passes, and one it fails. */
const CASES: [CriterionKey, Partial<BuyBox>, Partial<ListingFacts>, Partial<ListingFacts>][] = [
  ["geography", { geographyMode: "ZIPS", geography: ["78704"] }, {}, { zip: "78701" }],
  ["geography", { geographyMode: "STATES", geography: ["TX"] }, {}, { state: "OK" }],
  ["propertyType", { propertyTypes: ["SINGLE_FAMILY"] }, {}, { propertyType: "CONDO" }],
  [
    "price",
    { priceMin: 250_000, priceMax: 300_000 },
    { priceExpectationMax: 250_000 },
    { priceExpectationMax: 300_001 },
  ],
  ["price", { priceMin: 250_000 }, {}, { priceExpectationMax: 249_999 }],
  ["yearBuilt", { yearBuiltMin: 1980, yearBuiltMax: 2000 }, {}, { yearBuilt: 1979 }],
  ["beds", { bedsMin: 3 }, {}, { beds: 2 }],
  ["baths", { bathsMax: 2.5 }, {}, { baths: 3 }],
  ["sqft", { sqftMin: 1_000, sqftMax: 2_000 }, {}, { sqft: 2_400 }],
  ["units", { unitsMin: 2, unitsMax: 4 }, { units: 4 }, { units: 6 }],
  ["condition", { conditionsAccepted: ["FAIR", "POOR"] }, {}, { condition: "GOOD" }],
  ["repair", { repairMax: 40_000 }, {}, { repairEstimate: 45_000 }],
  // 30 days from 2026-11-01 is 2026-12-01: in time for a window ending 2026-12-15.
  ["closingSpeed", { closeWithinDays: 30 }, {}, { closingWindowEnd: "2026-11-25" }],
  ["listedStatus", { acceptsListed: false }, {}, { currentlyListed: true }],
  [
    "programs",
    { programsAccepted: ["CASH_OFFER", "SEVEN_DAY_SOLD"] },
    { eligiblePrograms: ["CASH_WITH_UPSIDE", "SEVEN_DAY_SOLD"] },
    { eligiblePrograms: ["CASH_WITH_UPSIDE"] },
  ],
];

describe("evaluateBuyBox", () => {
  it.each(CASES)(
    "%s: passes a listing that fits and fails one that does not",
    (key, box, fits, misses) => {
      const passing = evaluateBuyBox({ ...anyBox, ...box }, { ...listing, ...fits }, TODAY);
      expect(passing.results[key].passed).toBe(true);
      expect(passing.matched).toBe(true);

      const failing = evaluateBuyBox({ ...anyBox, ...box }, { ...listing, ...misses }, TODAY);
      expect(failing.results[key].passed).toBe(false);
      expect(failing.matched).toBe(false);
    },
  );

  it("treats every null criterion as any, even for a listing with every optional fact missing", () => {
    const sparse: ListingFacts = {
      ...listing,
      yearBuilt: null,
      beds: null,
      baths: null,
      sqft: null,
      units: null,
      condition: null,
      repairEstimate: null,
      closingWindowStart: null,
      closingWindowEnd: null,
      currentlyListed: null,
      eligiblePrograms: [],
    };
    expect(evaluateBuyBox(anyBox, sparse, TODAY).matched).toBe(true);
  });

  it("fails a set criterion when the listing value it needs is missing, with actual null", () => {
    const missing: [Partial<BuyBox>, Partial<ListingFacts>, CriterionKey][] = [
      [{ bedsMin: 2 }, { beds: null }, "beds"],
      [{ unitsMin: 2 }, { units: null }, "units"],
      [{ conditionsAccepted: ["FAIR"] }, { condition: null }, "condition"],
      [{ repairMax: 50_000 }, { repairEstimate: null }, "repair"],
      [{ closeWithinDays: 30 }, { closingWindowEnd: null }, "closingSpeed"],
      [{ acceptsListed: false }, { currentlyListed: null }, "listedStatus"],
    ];
    for (const [box, facts, key] of missing) {
      const result = evaluateBuyBox({ ...anyBox, ...box }, { ...listing, ...facts }, TODAY);
      expect(result.results[key]).toMatchObject({ passed: false, actual: null });
    }
  });
});
