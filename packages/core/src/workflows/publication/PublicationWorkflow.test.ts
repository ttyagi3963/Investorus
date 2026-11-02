// Guards the publish and withdraw rules (T290; FR-012, FR-013, FR-022): a publish names every
// field that blocks it; only the owning agent publishes or withdraws, and only a draft is
// published; a publish opens offers, snapshots listing version 1, and queues matching in the same
// change; a material edit after publish snapshots the next version and queues matching again; and
// a withdrawal declines open offers, tells matched investors, and frees the address. A package
// with no offers reopens as a new round that is matched again (T307, FR-058), and an edit made
// while it had no offers is matched when the deadline is extended (T375).
import type { Actor } from "@clever/contracts/auth";
import type { ValidationError } from "@clever/contracts/common";
import type { CreateListingPackageInput } from "@clever/contracts/listing-package";
import type { UserCredentials } from "@clever/contracts/user";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { StaticGeoProviderImpl } from "../../providers/geo/StaticGeoProviderImpl.js";
import { createAddressHasher } from "../../providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "../../services/listing-package/ListingPackageService.js";
import { world } from "../../../test/fixtures/published-package.js";
import { OfferRoundWorkflow } from "../offer-round/OfferRoundWorkflow.js";
import { PublicationWorkflow } from "./PublicationWorkflow.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const blake: Actor = { userId: "user-b", role: "AGENT", agentId: "agent-b" };
const summit: UserCredentials = {
  user: {
    id: "user-summit",
    email: "summit@example.com",
    role: "INVESTOR",
    displayName: "Summit",
    agentId: null,
    investorId: "investor-summit",
    active: true,
  },
  passwordHash: "hash",
} as UserCredentials;
const ready: CreateListingPackageInput = {
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

function setup() {
  const uow = new InMemoryUnitOfWork([summit]);
  const clock = { now: () => NOW };
  const packages = new ListingPackageService(uow, {
    geo: new StaticGeoProviderImpl(),
    addressHash: createAddressHasher("test-hash-key"),
    clock,
  });
  const publication = new PublicationWorkflow(uow, { clock });
  const draft = async (input: CreateListingPackageInput = ready, photos = 1) => {
    const created = await packages.create(avery, input);
    for (let i = 0; i < photos; i += 1) {
      await uow.repos.photos.add({
        packageId: created.package.id,
        storageKey: `photos/${i}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1_000,
        position: i,
      });
    }
    return created.package;
  };
  return { uow, packages, publication, draft };
}

const fields = (err: unknown) =>
  ((err as ValidationError).details?.fields as { field: string }[]).map((f) => f.field).sort();

describe("PublicationWorkflow", () => {
  it("publishes with a closing window starting on the agent's own today in the US evening (T387)", async () => {
    // 6:30 PM on 1 November in California; already 2 November in UTC.
    const clock = { now: () => new Date("2026-11-02T02:30:00Z") };
    const uow = new InMemoryUnitOfWork([summit]);
    const packages = new ListingPackageService(uow, {
      geo: new StaticGeoProviderImpl(),
      addressHash: createAddressHasher("test-hash-key"),
      clock,
    });
    const { package: pkg } = await packages.create(avery, {
      ...ready,
      closingWindowStart: "2026-11-01",
    });
    await uow.repos.photos.add({
      packageId: pkg.id,
      storageKey: "photos/0.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1_000,
      position: 0,
    });
    const { package: published } = await new PublicationWorkflow(uow, { clock }).publish(
      avery,
      pkg.id,
      { version: pkg.version },
    );
    expect(published.status).toBe("ACCEPTING_OFFERS");
  });

  it("names every field that blocks a publish", async () => {
    const { publication, draft } = setup();
    const bare = await draft(
      {
        ...ready,
        property: { streetLine: "1 Oak St", zip: "78704", propertyType: "SINGLE_FAMILY", beds: 3 },
        closingWindowStart: "2026-10-30",
        closingWindowEnd: undefined,
        currentlyListed: undefined,
        eligiblePrograms: undefined,
      },
      0,
    );
    const late = new Date(NOW.getTime() + 31 * 86_400_000).toISOString();
    const err = await publication
      .publish(avery, bare.id, { version: bare.version, offerDeadline: late })
      .catch((e: unknown) => e);
    expect(fields(err)).toEqual([
      "closingWindowEnd",
      "closingWindowStart",
      "currentlyListed",
      "eligiblePrograms",
      "offerDeadline",
      "photos",
      "property.baths",
      "property.condition",
      "property.sqft",
      "property.yearBuilt",
    ]);

    const land = await draft({
      ...ready,
      property: { streetLine: "9 Field Rd", zip: "78704", propertyType: "LAND" },
    });
    const landErr = await publication
      .publish(avery, land.id, { version: land.version })
      .catch((e: unknown) => e);
    expect(fields(landErr)).toEqual(["property.lotSqft"]);

    // FR-012: a multifamily home needs the building facts as well as its unit count (T375).
    const multi = await draft({
      ...ready,
      property: { streetLine: "5 Row Ave", zip: "78704", propertyType: "MULTI_FAMILY", units: 4 },
    });
    const multiErr = await publication
      .publish(avery, multi.id, { version: multi.version })
      .catch((e: unknown) => e);
    expect(fields(multiErr)).toEqual([
      "property.baths",
      "property.beds",
      "property.condition",
      "property.sqft",
      "property.yearBuilt",
    ]);
  });

  it("lets only the owning agent publish or withdraw, and publishes only a draft", async () => {
    const { publication, draft } = setup();
    const pkg = await draft();
    await expect(publication.publish(blake, pkg.id, { version: 1 })).rejects.toMatchObject({
      status: 404,
    });
    await expect(publication.withdraw(blake, pkg.id, { version: 1 })).rejects.toMatchObject({
      status: 404,
    });
    const published = await publication.publish(avery, pkg.id, { version: 1 });
    await expect(
      publication.publish(avery, pkg.id, { version: published.package.version }),
    ).rejects.toMatchObject({ code: "NOT_A_DRAFT" });
  });

  it("opens offers until the default deadline, snapshots version 1, and queues matching and the deadline in one change", async () => {
    const { uow, publication, draft } = setup();
    const pkg = await draft();
    const { package: published } = await publication.publish(avery, pkg.id, { version: 1 });

    expect(published).toMatchObject({
      status: "ACCEPTING_OFFERS",
      publishedAt: NOW,
      offerDeadline: new Date(NOW.getTime() + 72 * 3_600_000),
      listingVersion: 1,
    });
    const [snapshot] = uow.repos.listingVersions.rows;
    expect(snapshot).toMatchObject({ packageId: pkg.id, listingVersion: 1, round: 1 });
    expect(JSON.stringify(snapshot)).not.toMatch(/Elm|Maria|5551234567/);
    const deadline = new Date(NOW.getTime() + 72 * 3_600_000);
    expect(uow.repos.jobs.rows).toEqual([
      expect.objectContaining({
        type: "MATCH_PACKAGE",
        dedupeKey: `MATCH_PACKAGE:${pkg.id}:1:1`,
        payload: { packageId: pkg.id, round: 1, listingVersion: 1, trigger: "PUBLISH" },
      }),
      expect.objectContaining({
        type: "CLOSE_OFFER_ROUND",
        runAt: deadline,
        payload: { packageId: pkg.id, round: 1, offerDeadline: deadline.toISOString() },
      }),
    ]);
    expect(uow.repos.audit.entries.map((e) => e.action)).toContain("PACKAGE_PUBLISHED");
  });

  it("snapshots the next version and queues matching after a material edit, and not after another edit", async () => {
    const { uow, packages, publication, draft } = setup();
    const pkg = await draft();
    let { package: current } = await publication.publish(avery, pkg.id, { version: 1 });

    ({ package: current } = await packages.update(avery, pkg.id, {
      version: current.version,
      priceExpectationMax: 280_000,
    }));
    expect(current.listingVersion).toBe(2);
    expect(uow.repos.listingVersions.rows.map((v) => v.listingVersion)).toEqual([1, 2]);
    const matchRuns = () =>
      uow.repos.jobs.rows.filter((j) => j.type === "MATCH_PACKAGE").map((j) => j.dedupeKey);
    expect(matchRuns()).toEqual([`MATCH_PACKAGE:${pkg.id}:1:1`, `MATCH_PACKAGE:${pkg.id}:1:2`]);

    ({ package: current } = await packages.update(avery, pkg.id, {
      version: current.version,
      priceExpectationMin: 240_000,
      seller: { phone: "+15559876543" },
    }));
    expect(current.listingVersion).toBe(2);
    expect(matchRuns()).toHaveLength(2);
  });

  it("withdraws: declines open offers, tells matched investors, and frees the address", async () => {
    const { uow, packages, publication, draft } = setup();
    const pkg = await draft();
    const { package: published } = await publication.publish(avery, pkg.id, { version: 1 });
    await uow.repos.matches.upsert({
      packageId: pkg.id,
      investorId: "investor-summit",
      round: 1,
      matchedBuyBoxIds: ["box-1"],
      trigger: "PUBLISH",
    });
    await uow.repos.offers.create({
      packageId: pkg.id,
      investorId: "investor-summit",
      round: 1,
      price: 280_000,
      paymentType: "CASH",
      closingDate: "2026-12-01",
      earnestMoney: 5_000,
      contingencies: [],
      feesAndConcessions: 0,
      expiresAt: new Date("2026-11-03T12:00:00Z"),
    });

    const { package: withdrawn } = await publication.withdraw(avery, pkg.id, {
      version: published.version,
    });
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(uow.repos.offers.rows[0]!.status).toBe("DECLINED");
    expect(uow.repos.notifications.rows).toEqual([
      expect.objectContaining({
        userId: "user-summit",
        type: "PACKAGE_WITHDRAWN",
        packageId: pkg.id,
      }),
    ]);
    expect(JSON.stringify(uow.repos.notifications.rows)).not.toMatch(/Elm|Maria/);
    await expect(packages.create(avery, ready)).resolves.toBeDefined();
  });
});

describe("PublicationWorkflow.reopen", () => {
  it("reopens a package with no offers as the next round: a new deadline, listing version, match run, and deadline job", async () => {
    const w = world();
    const pkg = await w.publish();
    const [close] = w.uow.repos.jobs.rows.filter((j) => j.type === "CLOSE_OFFER_ROUND");
    w.clock.at = pkg.offerDeadline!;
    await new OfferRoundWorkflow(w.uow).closeRound(close!.payload as never);
    const closed = (await w.uow.repos.packages.findById(pkg.id))!;

    const deadline = new Date(w.clock.at.getTime() + 72 * 3_600_000);
    const { package: reopened } = await w.publication.reopen(avery, pkg.id, {
      version: closed.version,
      offerDeadline: deadline.toISOString(),
    });

    expect(reopened).toMatchObject({
      status: "ACCEPTING_OFFERS",
      round: 2,
      listingVersion: 2,
      offerDeadline: deadline,
    });
    expect(w.uow.repos.jobs.rows.slice(-2)).toEqual([
      expect.objectContaining({
        type: "MATCH_PACKAGE",
        payload: { packageId: pkg.id, round: 2, listingVersion: 2, trigger: "REOPEN" },
      }),
      expect.objectContaining({ type: "CLOSE_OFFER_ROUND", runAt: deadline }),
    ]);
    await expect(
      w.publication.reopen(avery, pkg.id, {
        version: reopened.version,
        offerDeadline: deadline.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "NOT_REOPENABLE" });
  });

  it("matches an edit made while no offers were open as a new listing version when the deadline is extended (T375)", async () => {
    const w = world();
    const pkg = await w.publish();
    const [close] = w.uow.repos.jobs.rows.filter((j) => j.type === "CLOSE_OFFER_ROUND");
    w.clock.at = pkg.offerDeadline!;
    await new OfferRoundWorkflow(w.uow).closeRound(close!.payload as never);
    const closed = (await w.uow.repos.packages.findById(pkg.id))!;
    const { package: edited } = await w.packages.update(avery, pkg.id, {
      version: closed.version,
      priceExpectationMax: 280_000,
    });

    const matchRuns = () => w.uow.repos.jobs.rows.filter((j) => j.type === "MATCH_PACKAGE");
    const extend = (version: number, hours: number) =>
      w.publication.extendDeadline(avery, pkg.id, {
        version,
        offerDeadline: new Date(w.clock.at.getTime() + hours * 3_600_000).toISOString(),
      });
    const { package: extended } = await extend(edited.version, 24);
    expect(extended).toMatchObject({ status: "ACCEPTING_OFFERS", round: 1, listingVersion: 2 });
    expect(w.uow.repos.listingVersions.rows.at(-1)).toMatchObject({
      listingVersion: 2,
      snapshot: { priceExpectationMax: 280_000 },
    });
    expect(matchRuns().at(-1)).toMatchObject({
      payload: { packageId: pkg.id, round: 1, listingVersion: 2, trigger: "PACKAGE_EDIT" },
    });

    // Nothing changed since that snapshot, so a second extension matches nothing again.
    await extend(extended.version, 48);
    expect(matchRuns()).toHaveLength(2);
  });
});
