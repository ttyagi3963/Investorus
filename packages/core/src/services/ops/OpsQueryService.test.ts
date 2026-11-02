// Guards "Why?" after a listing changes (T383; FR-074): the answer is about the package's current
// listing version, so an investor who no longer matches it is shown as not matched with the
// criterion that failed, a box that stopped matching is not shown as matched, and a box the
// investor saves so that it matches again is.
import type { BuyBox } from "@clever/contracts/buy-box";
import { describe, expect, it } from "vitest";
import { avery, world } from "../../../test/fixtures/published-package.js";
import type { IOpsQueryRepository } from "../../repositories/ops/IOpsQueryRepository.js";
import { MatchingWorkflow } from "../../workflows/matching/MatchingWorkflow.js";
import { OpsQueryService } from "./OpsQueryService.js";

const ops = { userId: "user-ops", role: "OPS", agentId: null } as const;
const box = (id: string, investor: string, priceMax: number): BuyBox => ({
  id,
  investorId: `investor-${investor}`,
  name: id,
  status: "ACTIVE",
  isDefault: false,
  strategy: null,
  geographyMode: "NATIONWIDE",
  geography: [],
  propertyTypes: null,
  priceMin: null,
  priceMax,
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
});

/** Published at $300k, matched, then raised to $310k and matched again. */
async function raisedPrice() {
  const { uow, clock, packages, publish } = world();
  const boxes = uow.repos.buyBoxes.boxes;
  boxes.push(
    box("Any price", "summit", 1_000_000),
    box("Up to 300k", "summit", 300_000),
    box("Ridge 300k", "ridge", 300_000),
  );
  // The operations read model is SQL; here it answers from the same in-memory rows.
  uow.repos.opsQuery = {
    findPackage: async (id: string) => uow.repos.packages.findById(id),
    buyBoxNames: async (ids: string[]) => new Map(ids.map((id) => [id, id])),
    buyBoxVersionAt: async (id: string) => {
      const found = boxes.find((b) => b.id === id)!;
      return { version: found.version, box: found };
    },
    listingVersionCreatedAt: async () => clock.now(),
  } as unknown as IOpsQueryRepository;
  const matching = new MatchingWorkflow(uow, { clock });
  const pkg = await publish("12 Elm St", []);
  await matching.evaluatePackage({
    packageId: pkg.id,
    round: 1,
    listingVersion: 1,
    trigger: "PUBLISH",
  });
  const { package: edited } = await packages.update(avery, pkg.id, {
    version: pkg.version,
    priceExpectationMax: 310_000,
  });
  await matching.evaluatePackage({
    packageId: pkg.id,
    round: 1,
    listingVersion: edited.listingVersion,
    trigger: "PACKAGE_EDIT",
  });
  const why = (investor: string) =>
    new OpsQueryService(uow).explainMatch(ops, pkg.id, `investor-${investor}`);
  return { boxes, matching, why };
}

describe("OpsQueryService.explainMatch", () => {
  it("explains the current listing version: a drop-out is not matched, and a box that stopped matching is not shown", async () => {
    const { why } = await raisedPrice();

    const ridge = await why("ridge");
    expect(ridge).toMatchObject({ matched: false, listingVersion: 2 });
    expect(ridge.buyBoxes[0]?.criteria).toContainEqual(
      expect.objectContaining({ key: "price", passed: false }),
    );

    const summit = await why("summit");
    expect(summit).toMatchObject({ matched: true, listingVersion: 2 });
    expect(summit.buyBoxes.map((b) => [b.name, b.matched])).toEqual([["Any price", true]]);
  });

  it("shows a box as matched again once the investor saves it so that it fits", async () => {
    const { boxes, matching, why } = await raisedPrice();
    const index = boxes.findIndex((b) => b.id === "Ridge 300k");
    boxes[index] = { ...boxes[index]!, priceMax: 400_000, version: 2 };

    await matching.evaluateBuyBox({ buyBoxId: "Ridge 300k", version: 2 });

    expect(await why("ridge")).toMatchObject({
      matched: true,
      listingVersion: 2,
      buyBoxes: [expect.objectContaining({ buyBoxId: "Ridge 300k", version: 2, matched: true })],
    });
  });
});
