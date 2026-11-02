// Guards the offer date rule (T387): a calendar date is "today" if it is today anywhere, so a user
// in the US evening, when the UTC date has already moved on, can still pick their own today.
import { describe, expect, it } from "vitest";
import { checkOfferDates } from "./offer-terms.js";

// 6:30 PM on 1 November in California; already 2 November in UTC.
const EVENING_IN_CALIFORNIA = new Date("2026-11-02T02:30:00Z");

const terms = (closingDate: string) => ({
  price: 280_000,
  paymentType: "CASH" as const,
  closingDate,
  earnestMoney: 5_000,
  contingencies: [],
  feesAndConcessions: 0,
  expiresAt: "2026-11-05T00:00:00Z",
});

describe("checkOfferDates", () => {
  it("accepts the user's own today in the US evening, and refuses the day before it", () => {
    expect(checkOfferDates(terms("2026-11-01"), EVENING_IN_CALIFORNIA).closingDate).toBe(
      "2026-11-01",
    );
    expect(() => checkOfferDates(terms("2026-10-31"), EVENING_IN_CALIFORNIA)).toThrow(
      "Some fields need fixing. See the messages below.",
    );
  });
});
