// Guards the buy box saves (T321; FR-060, FR-023): a save keeps its version and is audited, and
// queues matching only when the box can match something new (criteria changed, or resumed), never
// for a rename or a pause; a stale save is refused; an unknown ZIP code is refused by name; and an
// investor sees and saves only their own boxes.
import type { Actor } from "@clever/contracts/auth";
import type { BuyBoxInput } from "@clever/contracts/buy-box";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { investor } from "../../../test/fixtures/published-package.js";
import { StaticGeoProviderImpl } from "../../providers/geo/StaticGeoProviderImpl.js";
import { BuyBoxService } from "./BuyBoxService.js";

const ridge = investor("ridge");

const austin: BuyBoxInput = {
  name: "Austin flips",
  strategy: "FIX_FLIP",
  status: "ACTIVE",
  geographyMode: "ZIPS",
  geography: ["78704"],
  propertyTypes: ["SINGLE_FAMILY"],
  priceMin: 200_000,
  priceMax: 300_000,
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
};

function setup(now = new Date("2026-11-01T12:00:00Z")) {
  const uow = new InMemoryUnitOfWork();
  const service = new BuyBoxService(uow, {
    geo: new StaticGeoProviderImpl(),
    clock: { now: () => now },
  });
  const matchJobs = () =>
    uow.repos.jobs.rows.filter((job) => job.type === "MATCH_BUY_BOX").map((job) => job.dedupeKey);
  return { uow, service, matchJobs };
}

describe("BuyBoxService", () => {
  it("limits year built to next year by the injected clock, not the machine's (T387)", async () => {
    const { service } = setup(new Date("2030-06-01T12:00:00Z"));
    await expect(service.create(ridge, { ...austin, yearBuiltMax: 2031 })).resolves.toMatchObject({
      yearBuiltMax: 2031,
    });
    await expect(
      service.create(ridge, { ...austin, name: "Too new", yearBuiltMax: 2032 }),
    ).rejects.toMatchObject({ details: { fields: [{ field: "yearBuiltMax" }] } });
  });

  it("keeps each saved version, audits it, and queues matching for it", async () => {
    const { uow, service, matchJobs } = setup();
    const created = await service.create(ridge, austin);

    expect(created).toMatchObject({ investorId: "investor-ridge", version: 1 });
    expect(uow.repos.buyBoxes.versions).toEqual([
      { buyBoxId: created.id, version: 1, createdBy: "user-ridge" },
    ]);
    expect(uow.repos.audit.entries).toEqual([
      expect.objectContaining({ action: "BUY_BOX_SAVED", entityId: created.id }),
    ]);
    expect(matchJobs()).toEqual([`MATCH_BUY_BOX:${created.id}:1`]);
  });

  it("queues matching when the criteria change or the box resumes, not for a rename or a pause", async () => {
    const { service, matchJobs } = setup();
    const box = await service.create(ridge, austin);

    await service.update(ridge, box.id, { ...austin, name: "Austin", version: 1 });
    await service.update(ridge, box.id, {
      ...austin,
      name: "Austin",
      status: "PAUSED",
      version: 2,
    });
    await service.update(ridge, box.id, { ...austin, name: "Austin", version: 3 });
    await service.update(ridge, box.id, {
      ...austin,
      name: "Austin",
      priceMax: 350_000,
      version: 4,
    });

    expect(matchJobs()).toEqual([
      `MATCH_BUY_BOX:${box.id}:1`,
      `MATCH_BUY_BOX:${box.id}:4`,
      `MATCH_BUY_BOX:${box.id}:5`,
    ]);
  });

  it("refuses a save of a version the investor did not read", async () => {
    const { service } = setup();
    const box = await service.create(ridge, austin);
    await service.update(ridge, box.id, { ...austin, priceMax: 350_000, version: 1 });

    await expect(
      service.update(ridge, box.id, { ...austin, priceMax: 400_000, version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a ZIP code the lookup does not know, naming it", async () => {
    const { service } = setup();
    await expect(
      service.create(ridge, { ...austin, geography: ["78704", "00000"] }),
    ).rejects.toMatchObject({
      status: 400,
      details: {
        fields: [{ field: "geography", message: "ZIP 00000 is not a valid ZIP code" }],
      },
    });
  });

  it("shows and saves only the investor's own boxes", async () => {
    const { service } = setup();
    const box = await service.create(ridge, austin);
    const agent: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

    await expect(service.get(investor("summit"), box.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update(investor("summit"), box.id, { ...austin, version: 1 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await service.list(investor("summit"))).toEqual([]);
    await expect(service.list(agent)).rejects.toMatchObject({ status: 403 });
  });
});
