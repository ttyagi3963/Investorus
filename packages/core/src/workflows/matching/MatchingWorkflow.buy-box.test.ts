// Guards matching a saved buy box (T321; FR-023, FR-024): the box is matched against each package
// still taking offers and no other; a new match comes from the box change, with one in-app notice
// that holds no seller detail and an audited decision; an investor already matched gets the box
// added and no second notice; and a box saved again since, paused, or of an investor without valid
// proof of funds matches nothing.
import type { BuyBox } from "@clever/contracts/buy-box";
import { describe, expect, it } from "vitest";
import { avery, world } from "../../../test/fixtures/published-package.js";
import { MatchingWorkflow } from "./MatchingWorkflow.js";

const ridgeBox = (change: Partial<BuyBox> = {}): BuyBox => ({
  id: "ridge-austin",
  investorId: "investor-ridge",
  name: "Austin",
  status: "ACTIVE",
  isDefault: false,
  strategy: null,
  geographyMode: "ZIPS",
  geography: ["78704"],
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
  version: 2,
  ...change,
});

async function setup(box: BuyBox) {
  const w = world();
  const matching = new MatchingWorkflow(w.uow, { clock: w.clock });
  w.uow.repos.buyBoxes.boxes.push(box);
  const run = () => matching.evaluateBuyBox({ buyBoxId: box.id, version: 2 });
  return { ...w, run };
}

describe("MatchingWorkflow.evaluateBuyBox", () => {
  it("shares each package still taking offers once, with one notice and an audited decision", async () => {
    const { uow, clock, publish, publication, run } = await setup(ridgeBox());
    const open = await publish("12 Elm St", []);
    const withdrawn = await publish("14 Elm St", []);
    await publication.withdraw(avery, withdrawn.id, { version: withdrawn.version });

    await run();
    await run();

    expect(uow.repos.matches.rows).toEqual([
      expect.objectContaining({
        packageId: open.id,
        investorId: "investor-ridge",
        matchedBuyBoxIds: ["ridge-austin"],
        trigger: "BUY_BOX_CHANGE",
      }),
    ]);
    const notices = uow.repos.notifications.rows.filter((n) => n.userId === "user-ridge");
    expect(notices).toEqual([
      expect.objectContaining({ type: "PACKAGE_MATCHED", packageId: open.id }),
    ]);
    expect(JSON.stringify(notices)).not.toMatch(/Maria|Lopez|Elm|5551234567/);
    expect(uow.repos.audit.entries.filter((e) => e.action === "MATCH_DECISION")).toEqual([
      expect.objectContaining({ entityId: open.id }),
    ]);

    // After the deadline the package is no longer offered to new boxes.
    clock.at = new Date(open.offerDeadline!.getTime() + 1);
    uow.repos.matches.rows.length = 0;
    await run();
    expect(uow.repos.matches.rows).toEqual([]);
  });

  it("adds the box to an investor's existing match without a second notice", async () => {
    const { uow, publish, run } = await setup(ridgeBox());
    const pkg = await publish("12 Elm St", ["ridge"]);

    await run();

    expect(uow.repos.matches.rows).toEqual([
      expect.objectContaining({
        packageId: pkg.id,
        trigger: "PUBLISH",
        matchedBuyBoxIds: ["ridge-box", "ridge-austin"],
      }),
    ]);
    expect(uow.repos.notifications.rows.filter((n) => n.userId === "user-ridge")).toEqual([]);
  });

  it("matches nothing for a box saved again since, a paused box, or an investor without valid proof of funds", async () => {
    for (const [box, investor] of [
      [ridgeBox({ version: 3 }), null],
      [ridgeBox({ status: "PAUSED" }), null],
      [ridgeBox(), { status: "ACTIVE" as const, proofOfFundsExpiresAt: null }],
      [ridgeBox(), { status: "INACTIVE" as const, proofOfFundsExpiresAt: new Date("2027-01-01") }],
    ] as const) {
      const { uow, publish, run } = await setup(box);
      if (investor) uow.repos.buyBoxes.investors.set("investor-ridge", investor);
      await publish("12 Elm St", []);

      await run();

      expect(uow.repos.matches.rows).toEqual([]);
    }
  });
});
