// Guards the matching run (T292; FR-022, XII): one Match per matched investor naming every box that
// matched, one notification per newly matched investor with no seller detail, one audited decision
// per matched investor; a re-run adds nothing; after a material edit, an investor matched before
// hears that it changed only if a field their boxes check changed, even when it no longer fits them,
// and new ones hear that it matches (T366); and a stale job does nothing.
import type { Actor } from "@clever/contracts/auth";
import type { BuyBox } from "@clever/contracts/buy-box";
import type { CreateListingPackageInput } from "@clever/contracts/listing-package";
import type { UserCredentials } from "@clever/contracts/user";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { StaticGeoProviderImpl } from "../../providers/geo/StaticGeoProviderImpl.js";
import { createAddressHasher } from "../../providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "../../services/listing-package/ListingPackageService.js";
import { PublicationWorkflow } from "../publication/PublicationWorkflow.js";
import { MatchingWorkflow } from "./MatchingWorkflow.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const investorLogin = (name: string) =>
  ({
    user: {
      id: `user-${name}`,
      email: `${name}@example.com`,
      role: "INVESTOR",
      displayName: name,
      agentId: null,
      investorId: `investor-${name}`,
      active: true,
    },
    passwordHash: "hash",
  }) as UserCredentials;
const box = (id: string, investor: string, criteria: Partial<BuyBox>): BuyBox => ({
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
  version: 3,
  ...criteria,
});
const listing: CreateListingPackageInput = {
  seller: { fullName: "Maria Lopez", phone: "+15551234567" },
  property: {
    streetLine: "12 Elm St",
    zip: "78704",
    propertyType: "SINGLE_FAMILY",
    beds: 3,
    baths: 2,
    sqft: 1_600,
    yearBuilt: 1985,
    condition: "FAIR",
  },
  priceExpectationMin: 250_000,
  priceExpectationMax: 300_000,
  closingWindowStart: "2026-11-20",
  closingWindowEnd: "2026-12-15",
  currentlyListed: false,
  eligiblePrograms: ["CASH_OFFER"],
};

async function published() {
  const uow = new InMemoryUnitOfWork(["summit", "harbor", "ridge"].map(investorLogin));
  uow.repos.buyBoxes.boxes.push(
    box("Austin flips", "summit", { geographyMode: "ZIPS", geography: ["78704"] }),
    box("Texas rentals", "summit", {
      geographyMode: "STATES",
      geography: ["TX"],
      priceMax: 300_000,
    }),
    box("Anywhere", "harbor", {}),
    box("Starter homes", "ridge", { priceMax: 280_000 }),
  );
  const clock = { now: () => NOW };
  const packages = new ListingPackageService(uow, {
    geo: new StaticGeoProviderImpl(),
    addressHash: createAddressHasher("test-hash-key"),
    clock,
  });
  const created = await packages.create(avery, listing);
  await uow.repos.photos.add({
    packageId: created.package.id,
    storageKey: "photos/0.jpg",
    contentType: "image/jpeg",
    sizeBytes: 1_000,
    position: 0,
  });
  const { package: pkg } = await new PublicationWorkflow(uow, { clock }).publish(
    avery,
    created.package.id,
    { version: 1 },
  );
  return { uow, packages, pkg, matching: new MatchingWorkflow(uow, { clock }) };
}

const actions = (uow: InMemoryUnitOfWork, action: string) =>
  uow.repos.audit.entries.filter((e) => e.action === action);

describe("MatchingWorkflow", () => {
  it("records how many eligible buy boxes it weighed and why the others did not match, as counts", async () => {
    const { uow, packages, pkg, matching } = await published();
    uow.repos.buyBoxes.boxes.push(
      box("Dallas only", "ridge", { geographyMode: "ZIPS", geography: ["75201"] }),
    );
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });

    expect(actions(uow, "MATCHING_COMPLETED")[0]?.details).toMatchObject({
      evaluated: 5,
      exclusions: { geography: 1, price: 1 },
    });
    expect((await packages.get(avery, pkg.id)).matchSummary).toEqual({
      evaluated: 5,
      reasons: [
        { key: "geography", label: "Location", count: 1 },
        { key: "price", label: "Price", count: 1 },
      ],
    });
  });

  it("matches each investor once with every matching box, notifies each once, and audits each decision", async () => {
    const { uow, pkg, matching } = await published();
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });

    expect(
      uow.repos.matches.rows.map((m) => [m.investorId, m.matchedBuyBoxIds, m.trigger]),
    ).toEqual([
      ["investor-summit", ["Austin flips", "Texas rentals"], "PUBLISH"],
      ["investor-harbor", ["Anywhere"], "PUBLISH"],
    ]);
    const notified = uow.repos.notifications.rows;
    expect(notified.map((n) => [n.userId, n.type])).toEqual([
      ["user-summit", "PACKAGE_MATCHED"],
      ["user-harbor", "PACKAGE_MATCHED"],
    ]);
    expect(notified[0]!.body).toContain("Austin flips");
    expect(notified[0]!.body).toContain("Texas rentals");
    expect(JSON.stringify(notified)).not.toMatch(/Elm|Maria|5551234567/);

    const decisions = actions(uow, "MATCH_DECISION");
    expect(decisions.map((d) => d.details?.investorId)).toEqual([
      "investor-summit",
      "investor-harbor",
    ]);
    expect(decisions[0]).toMatchObject({
      actorType: "SYSTEM",
      details: {
        listingVersion: 1,
        evaluatorVersion: 1,
        buyBoxes: [
          expect.objectContaining({ id: "Austin flips", version: 3 }),
          expect.objectContaining({ id: "Texas rentals", version: 3 }),
        ],
      },
    });
    expect(decisions[0]!.details?.buyBoxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          criteria: expect.objectContaining({ price: expect.any(Object) }),
        }),
      ]),
    );
    expect(JSON.stringify(decisions)).not.toMatch(/Elm|Maria/);
    expect(actions(uow, "MATCHING_COMPLETED")).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ matchedCount: 2 }) }),
    ]);
  });

  it("adds no match, notification, or decision when the same version runs again", async () => {
    const { uow, pkg, matching } = await published();
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });
    expect(uow.repos.matches.rows).toHaveLength(2);
    expect(uow.repos.notifications.rows).toHaveLength(2);
    expect(actions(uow, "MATCH_DECISION")).toHaveLength(2);
  });

  it("after a material edit, tells a notified investor only when a field their boxes check changed, even if they no longer match", async () => {
    const { uow, packages, pkg, matching } = await published();
    const run = (listingVersion: number, trigger: "PUBLISH" | "PACKAGE_EDIT") =>
      matching.evaluatePackage({ packageId: pkg.id, round: 1, listingVersion, trigger });
    const edit = async (priceExpectationMax: number) => {
      const current = (await uow.repos.packages.findById(pkg.id))!;
      const { package: edited } = await packages.update(avery, pkg.id, {
        version: current.version,
        priceExpectationMax,
      });
      await run(edited.listingVersion, "PACKAGE_EDIT");
      await run(edited.listingVersion, "PACKAGE_EDIT");
    };
    const told = (from: number) =>
      uow.repos.notifications.rows.slice(from).map((n) => [n.userId, n.type]);
    await run(1, "PUBLISH");

    // Price lowered: summit's Texas box checks price, harbor's box checks nothing, ridge now fits.
    await edit(275_000);
    expect(told(2)).toEqual([
      ["user-summit", "PACKAGE_CHANGED"],
      ["user-ridge", "PACKAGE_MATCHED"],
    ]);
    expect(uow.repos.matches.rows.find((m) => m.investorId === "investor-ridge")?.trigger).toBe(
      "PACKAGE_EDIT",
    );

    // Price raised past ridge's maximum: ridge no longer matches but is told; harbor still is not.
    await edit(290_000);
    expect(told(4)).toEqual([
      ["user-summit", "PACKAGE_CHANGED"],
      ["user-ridge", "PACKAGE_CHANGED"],
    ]);
  });

  it("tells an investor matched but never told that the listing matches, when it is next evaluated (T373)", async () => {
    const { uow, pkg, matching } = await published();
    // A match recorded without a notice, as the deal demo's seed once wrote them.
    await uow.repos.matches.upsert({
      packageId: pkg.id,
      investorId: "investor-harbor",
      round: 1,
      matchedBuyBoxIds: ["Anywhere"],
      trigger: "PUBLISH",
    });

    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });

    const harbor = uow.repos.notifications.rows.filter((n) => n.userId === "user-harbor");
    expect(harbor.map((n) => n.type)).toEqual(["PACKAGE_MATCHED"]);
  });

  it("does nothing for an older listing version or a withdrawn package", async () => {
    const { uow, packages, pkg, matching } = await published();
    const { package: edited } = await packages.update(avery, pkg.id, {
      version: pkg.version,
      priceExpectationMax: 275_000,
    });
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: 1,
      trigger: "PUBLISH",
    });
    expect(uow.repos.matches.rows).toEqual([]);

    await new PublicationWorkflow(uow, { clock: { now: () => NOW } }).withdraw(avery, pkg.id, {
      version: edited.version,
    });
    await matching.evaluatePackage({
      packageId: pkg.id,
      round: 1,
      listingVersion: edited.listingVersion,
      trigger: "PACKAGE_EDIT",
    });
    expect(uow.repos.matches.rows).toEqual([]);
    expect(uow.repos.notifications.rows).toEqual([]);
  });
});
