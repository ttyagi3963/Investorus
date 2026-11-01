// Guards the draft package rules (T258): an unknown ZIP or future year is refused on its field, city and state
// come from the ZIP, one package per address across all agents (FR-013), an agent only reaches their
// own packages (FR-080), a stale edit is refused, and an edit is checked on the merged result.
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  type ValidationError,
} from "@clever/contracts/common";
import type { CreateListingPackageInput } from "@clever/contracts/listing-package";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { StaticGeoProviderImpl } from "../../providers/geo/StaticGeoProviderImpl.js";
import { createAddressHasher } from "../../providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "./ListingPackageService.js";

const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const blake: Actor = { userId: "user-b", role: "AGENT", agentId: "agent-b" };
const draft: CreateListingPackageInput = {
  seller: { fullName: "Maria Lopez", phone: "+15551234567" },
  property: { streetLine: "12 Elm St", zip: "78701", propertyType: "SINGLE_FAMILY", beds: 3 },
  priceExpectationMin: 300_000,
  priceExpectationMax: 350_000,
};
const service = () =>
  new ListingPackageService(new InMemoryUnitOfWork(), {
    geo: new StaticGeoProviderImpl(),
    addressHash: createAddressHasher("test-hash-key"),
    clock: { now: () => new Date("2026-11-01T12:00:00Z") },
  });
const fields = (err: unknown) =>
  ((err as ValidationError).details?.fields as { field: string }[]).map((f) => f.field);

describe("ListingPackageService", () => {
  it("refuses an unknown ZIP and a future year built, on their fields", async () => {
    const s = service();
    const unknownZip = { ...draft, property: { ...draft.property, zip: "99999" } };
    expect(fields(await s.create(avery, unknownZip).catch((e: unknown) => e))).toEqual([
      "property.zip",
    ]);
    const future = { ...draft, property: { ...draft.property, yearBuilt: 2027 } };
    expect(fields(await s.create(avery, future).catch((e: unknown) => e))).toEqual([
      "property.yearBuilt",
    ]);
  });

  it("takes the city, state, and default neighborhood from the ZIP", async () => {
    const created = await service().create(avery, draft);
    expect(created.property).toMatchObject({
      city: "Austin",
      state: "TX",
      neighborhood: "Downtown",
    });
    expect(created.package).toMatchObject({ status: "DRAFT", version: 1, agentId: "agent-a" });
  });

  it("blocks a second package for the same address, telling only its owner which one it is", async () => {
    const s = service();
    const first = await s.create(avery, draft);
    const sameAddress = { ...draft, property: { ...draft.property, streetLine: " 12  elm st. " } };
    const mine = await s.create(avery, sameAddress).catch((e: unknown) => e);
    expect(mine).toBeInstanceOf(BusinessRuleError);
    expect(mine).toMatchObject({
      code: "DUPLICATE_ACTIVE_LISTING",
      details: { existingPackageId: first.package.id },
    });
    const theirs = (await s
      .create(blake, sameAddress)
      .catch((e: unknown) => e)) as BusinessRuleError;
    expect(theirs.code).toBe("DUPLICATE_ACTIVE_LISTING");
    expect(theirs.details).toBeUndefined();

    const other = await s.create(avery, {
      ...draft,
      property: { ...draft.property, streetLine: "14 Elm St" },
    });
    const moved = s.update(avery, other.package.id, {
      version: 1,
      property: { streetLine: "12 Elm St" },
    });
    await expect(moved).rejects.toMatchObject({ code: "DUPLICATE_ACTIVE_LISTING" });
  });

  it("keeps an agent out of another agent's packages, and other roles out of drafts", async () => {
    const s = service();
    const { package: pkg } = await s.create(avery, draft);
    await expect(s.get(blake, pkg.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await s.list(blake)).toEqual([]);
    await expect(
      s.update(blake, pkg.id, { version: 1, priceExpectationMax: 1 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const ops: Actor = { userId: "user-o", role: "OPS", agentId: null };
    await expect(s.create(ops, draft)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses an edit based on a stale version", async () => {
    const s = service();
    const { package: pkg } = await s.create(avery, draft);
    expect(
      (await s.update(avery, pkg.id, { version: 1, priceExpectationMax: 360_000 })).package.version,
    ).toBe(2);
    await expect(
      s.update(avery, pkg.id, { version: 1, priceExpectationMax: 370_000 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("checks an edit on the merged result: units, the price range, and the seller's last contact", async () => {
    const s = service();
    const { package: pkg } = await s.create(avery, draft);
    const edit = (change: object) =>
      s.update(avery, pkg.id, { version: 1, ...change }).catch((e: unknown) => e);
    expect(fields(await edit({ property: { units: 4 } }))).toEqual(["property.units"]);
    expect(fields(await edit({ priceExpectationMin: 400_000 }))).toEqual(["priceExpectationMax"]);
    expect(fields(await edit({ seller: { phone: null } }))).toEqual(["seller.email"]);
  });
});
