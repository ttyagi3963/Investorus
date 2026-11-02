// Guards the draft package rules (T258): an unknown ZIP or future year is refused on its field, city and state
// come from the ZIP, one active package per address across all agents, a closed or withdrawn one
// freeing it (FR-013, T369), an agent only reaches their
// own packages (FR-080), a stale edit is refused, an edit is checked on the merged result, and each
// change is audited without seller PII (T282, XII).
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
import { world } from "../../../test/fixtures/published-package.js";
import { ListingPackageService } from "./ListingPackageService.js";

const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const blake: Actor = { userId: "user-b", role: "AGENT", agentId: "agent-b" };
const draft: CreateListingPackageInput = {
  seller: { fullName: "Maria Lopez", phone: "+15551234567" },
  property: { streetLine: "12 Elm St", zip: "78701", propertyType: "SINGLE_FAMILY", beds: 3 },
  priceExpectationMin: 300_000,
  priceExpectationMax: 350_000,
};
const service = (uow = new InMemoryUnitOfWork()) =>
  new ListingPackageService(uow, {
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

  it("checks an edit to one end of the closing window against the stored other end", async () => {
    const s = service();
    const created = await s.create(avery, {
      ...draft,
      closingWindowStart: "2026-12-01",
      closingWindowEnd: "2026-12-31",
    });
    const id = created.package.id;
    const early = await s
      .update(avery, id, { version: 1, closingWindowEnd: "2026-11-15" })
      .catch((e: unknown) => e);
    expect(fields(early)).toEqual(["closingWindowEnd"]);
    await expect(
      s.update(avery, id, { version: 1, closingWindowStart: null, closingWindowEnd: "2026-11-15" }),
    ).resolves.toBeDefined();
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

  it("frees an address once its package is closed or withdrawn (T369)", async () => {
    const uow = new InMemoryUnitOfWork();
    const s = service(uow);
    for (const status of ["CLOSED", "WITHDRAWN"] as const) {
      const ended = await s.create(avery, draft);
      uow.repos.packages.rows.get(ended.package.id)!.status = status;
      await expect(s.create(blake, draft)).resolves.toMatchObject({
        package: { status: "DRAFT" },
      });
      await expect(s.create(avery, draft)).rejects.toMatchObject({
        code: "DUPLICATE_ACTIVE_LISTING",
      });
      // The new package is active; end it too, so the next status starts from a free address.
      for (const row of uow.repos.packages.rows.values()) row.status = "WITHDRAWN";
    }
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

  it("audits a create and an edit as the acting user, naming changed fields but never their values", async () => {
    const uow = new InMemoryUnitOfWork();
    const s = service(uow);
    const { package: pkg } = await s.create(avery, draft);
    await s.update(avery, pkg.id, {
      version: 1,
      priceExpectationMax: 360_000,
      seller: { phone: "+15559876543" },
    });
    const entry = {
      actorType: "USER",
      actorId: "user-a",
      entityType: "ListingPackage",
      entityId: pkg.id,
    };
    expect(uow.repos.audit.entries).toEqual([
      expect.objectContaining({ ...entry, action: "PACKAGE_CREATED", outcome: "SUCCESS" }),
      expect.objectContaining({
        ...entry,
        action: "PACKAGE_UPDATED",
        details: { fields: ["priceExpectationMax", "seller.phone"] },
      }),
    ]);
    expect(JSON.stringify(uow.repos.audit.entries)).not.toMatch(/Maria|5551234567|5559876543|Elm/);
  });

  it("shows a package's timeline newest first to its agent only, without per-investor decisions", async () => {
    const { uow, packages, publish } = world();
    const pkg = await publish();
    for (const action of ["MATCH_DECISION", "MATCHING_COMPLETED"] as const) {
      await uow.repos.audit.append({
        actorType: "SYSTEM",
        actorId: null,
        action,
        entityType: "ListingPackage",
        entityId: pkg.id,
        outcome: "SUCCESS",
        details:
          action === "MATCH_DECISION" ? { investorId: "investor-summit" } : { matchedCount: 1 },
      });
    }
    const timeline = await packages.timeline(avery, pkg.id);
    expect(timeline.map((e) => e.action)).toEqual([
      "MATCHING_COMPLETED",
      "PACKAGE_PUBLISHED",
      "PACKAGE_CREATED",
    ]);
    await expect(packages.timeline(blake, pkg.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
