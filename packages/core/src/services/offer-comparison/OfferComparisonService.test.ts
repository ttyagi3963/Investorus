// Guards the agent's comparison (T308; FR-050, FR-051): it sorts by net proceeds, closing date, or
// certainty; it shows the offers still in play (active, countered, backup) and marks an expired one
// as not acceptable; it flags the offer of an investor operations deactivated, which cannot be
// accepted either (T370); it returns the fee assumptions it used; and only the package's agent sees it.
import { describe, expect, it } from "vitest";
import { avery, blake, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "../offer/OfferService.js";
import { OfferComparisonService } from "./OfferComparisonService.js";

async function setup() {
  const w = world();
  const pkg = await w.publish("12 Elm St", ["summit", "harbor", "ridge"]);
  const offers = new OfferService(w.uow, { clock: w.clock });
  const made = {
    // Net 272,900; closes Dec 1; certainty 2 (one contingency, cash).
    summit: await offers.create(investor("summit"), pkg.id, offer()),
    // Net 272,700; closes Nov 25; certainty 3 (financed); expires first.
    harbor: await offers.create(
      investor("harbor"),
      pkg.id,
      offer({
        price: 290_000,
        feesAndConcessions: 10_000,
        paymentType: "FINANCED",
        contingencies: ["FINANCING"],
        closingDate: "2026-11-25",
        expiresAt: "2026-11-02T12:00:00Z",
      }),
    ),
    // Net 268,000; closes Dec 10; certainty 0.
    ridge: await offers.create(
      investor("ridge"),
      pkg.id,
      offer({ price: 275_000, contingencies: [], closingDate: "2026-12-10" }),
    ),
  };
  const comparison = new OfferComparisonService(w.uow, { clock: w.clock });
  return { ...w, pkg, offers, made, comparison };
}

describe("OfferComparisonService", () => {
  it.each([
    ["netProceeds", ["summit", "harbor", "ridge"]],
    ["closingDate", ["harbor", "summit", "ridge"]],
    ["certainty", ["ridge", "summit", "harbor"]],
  ])("sorts by %s", async (sort, expected) => {
    const { pkg, comparison } = await setup();
    const { rows } = await comparison.compare(avery, pkg.id, { sort });
    expect(rows.map((row) => row.offer.investorId)).toEqual(
      expected.map((name) => `investor-${name}`),
    );
  });

  it("shows the offers still in play, marks an expired one not acceptable, and returns its assumptions", async () => {
    const { pkg, clock, offers, made, comparison } = await setup();
    await offers.withdraw(investor("ridge"), made.ridge.id, { version: made.ridge.version });
    clock.at = new Date("2026-11-02T13:00:00Z");

    const { rows, assumptions } = await comparison.compare(avery, pkg.id, {});
    expect(rows.map((row) => [row.offer.investorId, row.expired, row.acceptable])).toEqual([
      ["investor-summit", false, true],
      ["investor-harbor", true, false],
    ]);
    expect(rows[0]?.netProceeds).toBe(272_900);
    expect(assumptions).toEqual({ closingCostPct: 0.02, flatFees: 1_500 });
  });

  it("flags a deactivated investor's offer, rather than hiding it, and makes it not acceptable (T370)", async () => {
    const { uow, pkg, comparison } = await setup();
    uow.repos.investors.inactive.add("investor-summit");

    const { rows } = await comparison.compare(avery, pkg.id, { sort: "netProceeds" });
    const summit = rows.find((row) => row.offer.investorId === "investor-summit");
    const ridge = rows.find((row) => row.offer.investorId === "investor-ridge");
    expect(summit).toMatchObject({ investorActive: false, acceptable: false });
    expect(ridge).toMatchObject({ investorActive: true, acceptable: true });
  });

  it("is the package's agent's only", async () => {
    const { pkg, comparison } = await setup();
    await expect(comparison.compare(blake, pkg.id, {})).rejects.toMatchObject({ status: 404 });
    await expect(comparison.compare(investor("summit"), pkg.id, {})).rejects.toMatchObject({
      status: 403,
    });
  });
});
