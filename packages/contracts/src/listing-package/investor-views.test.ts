// Guards the investor's privacy boundary (T295; SC-006, XX.1): what an investor sees of a package,
// in the list and on its page, carries no seller name, email, phone, or street, not even as a key.
import { describe, expect, it } from "vitest";
import { toInvestorPackageSummary, toInvestorPackageView } from "./investor-views.js";

const now = new Date("2026-11-01T12:00:00Z");
const parts = {
  package: {
    id: "p1",
    agentId: "a1",
    sellerId: "s1",
    propertyId: "pr1",
    status: "ACCEPTING_OFFERS" as const,
    round: 1,
    priceExpectationMin: 250_000,
    priceExpectationMax: 300_000,
    closingWindowStart: "2026-11-20",
    closingWindowEnd: "2026-12-15",
    currentlyListed: false,
    eligiblePrograms: ["CASH_OFFER" as const],
    offerDeadline: now,
    publishedAt: now,
    listingVersion: 1,
    version: 2,
    createdAt: now,
    updatedAt: now,
  },
  property: {
    id: "pr1",
    streetLine: "12 Elm St",
    zip: "78704",
    city: "Austin",
    state: "TX",
    neighborhood: "Bouldin",
    propertyType: "SINGLE_FAMILY" as const,
    beds: 3,
    baths: 2,
    sqft: 1_600,
    lotSqft: null,
    units: null,
    yearBuilt: 1985,
    condition: "FAIR" as const,
    repairEstimate: 25_000,
    createdAt: now,
    updatedAt: now,
  },
  photos: [],
  myOffer: null,
  myDeal: null,
  matchedAt: now,
};
// The kind of object a careless mapper might spread into a view.
const leaky = { ...parts, seller: { fullName: "Maria Lopez", email: "m@x.test", phone: "+1555" } };

describe("investor package views", () => {
  it("carry no seller detail or street, as a value or as a key", () => {
    for (const view of [toInvestorPackageView(leaky), toInvestorPackageSummary(leaky)]) {
      const text = JSON.stringify(view);
      expect(text).not.toMatch(/Maria|m@x\.test|\+1555|Elm/);
      expect(text).not.toMatch(/"(fullName|email|phone|streetLine)"/);
    }
  });
});
