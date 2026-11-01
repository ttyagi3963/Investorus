// The Criterion Registry's evaluator layer (T287; constitution XIX.3): one pure predicate per
// criterion key, so a criterion missing here fails the build. A null criterion passes ("any"); a
// listing value a set criterion needs that is missing fails it, with `actual: null` (FR-025).
// Raise EVALUATOR_VERSION whenever any predicate changes: each match decision records it.
import type { BuyBox, CriterionKey } from "@clever/contracts/buy-box";
import type { ListingFacts } from "./listing-facts.js";

export const EVALUATOR_VERSION = 1;

/** One criterion's outcome, as the audit log records it: what the box asked for and what it saw. */
export type CriterionResult = { passed: boolean; expected: unknown; actual: unknown };

/** `today` is `YYYY-MM-DD`, the day matching runs. */
type Evaluator = (box: BuyBox, listing: ListingFacts, today: string) => CriterionResult;

const anyValue = (actual: unknown): CriterionResult => ({ passed: true, expected: null, actual });

function inRange(min: number | null, max: number | null, actual: number | null): CriterionResult {
  if (min === null && max === null) return anyValue(actual);
  const expected = { min, max };
  if (actual === null) return { passed: false, expected, actual };
  return {
    passed: (min === null || actual >= min) && (max === null || actual <= max),
    expected,
    actual,
  };
}

function oneOf<T>(accepted: readonly T[] | null, actual: T | null): CriterionResult {
  if (accepted === null) return anyValue(actual);
  return { passed: actual !== null && accepted.includes(actual), expected: accepted, actual };
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const EVALUATORS = {
  geography: (box, listing) => {
    if (box.geographyMode === "NATIONWIDE") return anyValue(listing.zip);
    const actual = box.geographyMode === "STATES" ? listing.state : listing.zip;
    return { passed: box.geography.includes(actual), expected: box.geography, actual };
  },
  propertyType: (box, listing) => oneOf(box.propertyTypes, listing.propertyType),
  // The seller's top price must sit inside the investor's range.
  price: (box, listing) => inRange(box.priceMin, box.priceMax, listing.priceExpectationMax),
  yearBuilt: (box, listing) => inRange(box.yearBuiltMin, box.yearBuiltMax, listing.yearBuilt),
  beds: (box, listing) => inRange(box.bedsMin, box.bedsMax, listing.beds),
  baths: (box, listing) => inRange(box.bathsMin, box.bathsMax, listing.baths),
  sqft: (box, listing) => inRange(box.sqftMin, box.sqftMax, listing.sqft),
  units: (box, listing) => inRange(box.unitsMin, box.unitsMax, listing.units),
  condition: (box, listing) => oneOf(box.conditionsAccepted, listing.condition),
  repair: (box, listing) => inRange(null, box.repairMax, listing.repairEstimate),
  // The investor needs up to `closeWithinDays` to close, so counting from today they must be able
  // to close by the last day of the seller's window; they can always wait for its first day.
  closingSpeed: (box, listing, today) => {
    if (box.closeWithinDays === null) return anyValue(listing.closingWindowEnd);
    const expected = { closeBy: addDays(today, box.closeWithinDays) };
    const actual = listing.closingWindowEnd;
    return { passed: actual !== null && expected.closeBy <= actual, expected, actual };
  },
  // Fails only for a home already listed when the investor does not take listed homes.
  listedStatus: (box, listing) => {
    if (box.acceptsListed) return anyValue(listing.currentlyListed);
    const actual = listing.currentlyListed;
    return { passed: actual === false, expected: { listed: false }, actual };
  },
  programs: (box, listing) => {
    if (box.programsAccepted === null) return anyValue(listing.eligiblePrograms);
    const accepted = box.programsAccepted;
    return {
      passed: listing.eligiblePrograms.some((program) => accepted.includes(program)),
      expected: accepted,
      actual: listing.eligiblePrograms,
    };
  },
} as const satisfies Record<CriterionKey, Evaluator>;
