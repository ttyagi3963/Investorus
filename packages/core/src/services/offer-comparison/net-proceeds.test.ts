// Guards how offers are put side by side (T308; FR-050, FR-051): net proceeds subtract the same
// items, computed the same way, for every offer, and each is listed; certainty favors fewer
// contingencies, and cash over financing on a tie.
import { describe, expect, it } from "vitest";
import { certaintyRank, computeNetProceeds } from "./net-proceeds.js";

describe("computeNetProceeds", () => {
  it("subtracts the fees and concessions, the rounded closing-cost share, and the flat fees, listing each", () => {
    const result = computeNetProceeds(
      { price: 300_025, feesAndConcessions: 4_000 },
      { closingCostPct: 0.02, flatFees: 1_500 },
    );
    expect(result.breakdown.map((line) => line.amount)).toEqual([300_025, -4_000, -6_001, -1_500]);
    expect(result.netProceeds).toBe(300_025 - 4_000 - 6_001 - 1_500);
  });
});

describe("certaintyRank", () => {
  it("ranks fewer contingencies first, and cash ahead of financed on a tie", () => {
    const cashOne = certaintyRank({ paymentType: "CASH", contingencies: ["INSPECTION"] });
    const financedOne = certaintyRank({ paymentType: "FINANCED", contingencies: ["FINANCING"] });
    const cashTwo = certaintyRank({ paymentType: "CASH", contingencies: ["INSPECTION", "TITLE"] });
    expect(cashOne).toBeLessThan(financedOne);
    expect(financedOne).toBeLessThan(cashTwo);
  });
});
