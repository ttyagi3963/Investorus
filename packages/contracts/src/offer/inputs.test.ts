// Guards the offer terms' list rule (T389; FR-050): a contingency counts once, so listing it twice
// cannot make an offer look less certain than it is on the agent's comparison.
import { describe, expect, it } from "vitest";
import { createOfferInputSchema } from "./inputs.js";

const offer = {
  price: 250_000,
  paymentType: "CASH",
  closingDate: "2026-12-15",
  earnestMoney: 5_000,
  contingencies: ["INSPECTION"],
  feesAndConcessions: 0,
  expiresAt: "2026-12-01T17:00:00.000Z",
};

describe("offer terms", () => {
  it("refuse a contingency listed twice, naming the contingencies", () => {
    const result = createOfferInputSchema.safeParse({
      ...offer,
      contingencies: ["INSPECTION", "INSPECTION"],
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((issue) => issue.path.join("."))).toEqual(["contingencies"]);
  });
});
