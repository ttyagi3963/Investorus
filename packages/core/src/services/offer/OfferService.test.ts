// Guards the offer rules (T296; FR-042, XII): only a matched investor can offer (others get "not
// found"); no offer after the deadline or on a withdrawn package, and the refusal says why; one
// active offer per investor and round, so a second points to revise; a revise writes the next
// revision and needs the version it read; the dates must be ahead; only the package's agent sees
// its offers; every submit and revise is audited; and an investor can withdraw an offer until it
// is accepted, even after the deadline (T307, FR-043).
import type { ValidationError } from "@clever/contracts/common";
import { describe, expect, it } from "vitest";
import { avery, blake, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "./OfferService.js";

const summit = investor("summit");

describe("OfferService", () => {
  it("refuses an unmatched investor, a late offer, and an offer on a withdrawn package, saying why", async () => {
    const { uow, clock, publication, publish } = world();
    const pkg = await publish();
    const offers = new OfferService(uow, { clock });

    await expect(offers.create(investor("harbor"), pkg.id, offer())).rejects.toMatchObject({
      status: 404,
    });

    clock.at = new Date(pkg.offerDeadline!.getTime() + 1);
    const later = offer({ expiresAt: "2026-11-10T12:00:00Z" });
    await expect(offers.create(summit, pkg.id, later)).rejects.toMatchObject({
      code: "OFFER_DEADLINE_PASSED",
    });

    clock.at = new Date("2026-11-01T13:00:00Z");
    await publication.withdraw(avery, pkg.id, { version: pkg.version });
    await expect(offers.create(summit, pkg.id, offer())).rejects.toMatchObject({
      code: "PACKAGE_NOT_ACCEPTING_OFFERS",
    });
  });

  it("names a closing date in the past and an expiry already passed", async () => {
    const { uow, clock, publish } = world();
    const pkg = await publish();
    const err = await new OfferService(uow, { clock })
      .create(
        summit,
        pkg.id,
        offer({ closingDate: "2026-10-31", expiresAt: "2026-11-01T11:00:00Z" }),
      )
      .catch((e: unknown) => e);
    const fields = ((err as ValidationError).details?.fields as { field: string }[]).map(
      (f) => f.field,
    );
    expect(fields.sort()).toEqual(["closingDate", "expiresAt"]);
  });

  it("points a second offer to revise, and revises to the next revision only from the current version", async () => {
    const { uow, clock, publish } = world();
    const pkg = await publish();
    const offers = new OfferService(uow, { clock });
    const first = await offers.create(summit, pkg.id, offer());

    await expect(offers.create(summit, pkg.id, offer())).rejects.toMatchObject({
      code: "OFFER_EXISTS",
      details: { offerId: first.id },
    });
    const revised = await offers.revise(summit, first.id, {
      ...offer({ price: 290_000 }),
      version: 1,
    });
    expect(revised).toMatchObject({ price: 290_000, currentRevision: 2, version: 2 });
    expect(uow.repos.offers.revisions.map((r) => r.revision)).toEqual([1, 2]);
    await expect(
      offers.revise(summit, first.id, { ...offer({ price: 295_000 }), version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      offers.revise(investor("harbor"), first.id, { ...offer(), version: 2 }),
    ).rejects.toMatchObject({ status: 404 });

    expect(
      uow.repos.audit.entries
        .filter((e) => e.action.startsWith("OFFER_"))
        .map((e) => [e.action, e.actorId, e.details.revision]),
    ).toEqual([
      ["OFFER_SUBMITTED", "user-summit", 1],
      ["OFFER_REVISED", "user-summit", 2],
    ]);
  });

  it("shows a package's offers only to its agent", async () => {
    const { uow, clock, publish } = world();
    const pkg = await publish();
    const offers = new OfferService(uow, { clock });
    await offers.create(summit, pkg.id, offer());

    expect(await offers.listForPackage(avery, pkg.id)).toHaveLength(1);
    await expect(offers.listForPackage(blake, pkg.id)).rejects.toMatchObject({ status: 404 });
    await expect(offers.listForPackage(summit, pkg.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("OfferService.withdraw", () => {
  it("withdraws an open offer, so a new one can be made before the deadline, and still withdraws after it", async () => {
    const { uow, clock, publish } = world();
    const pkg = await publish();
    const offers = new OfferService(uow, { clock });
    const first = await offers.create(summit, pkg.id, offer());

    await expect(
      offers.withdraw(summit, first.id, { version: first.version }),
    ).resolves.toMatchObject({ status: "WITHDRAWN" });
    const second = await offers.create(summit, pkg.id, offer());

    clock.at = new Date(pkg.offerDeadline!.getTime() + 1);
    await expect(
      offers.withdraw(summit, second.id, { version: second.version }),
    ).resolves.toMatchObject({ status: "WITHDRAWN" });
    expect(uow.repos.audit.entries.filter((e) => e.action === "OFFER_WITHDRAWN")).toHaveLength(2);
  });

  it("refuses to withdraw an accepted offer, or another investor's", async () => {
    const { uow, clock, publish } = world();
    const pkg = await publish("12 Elm St", ["summit", "harbor"]);
    const offers = new OfferService(uow, { clock });
    const made = await offers.create(summit, pkg.id, offer());

    await expect(
      offers.withdraw(investor("harbor"), made.id, { version: made.version }),
    ).rejects.toMatchObject({ status: 404 });
    const accepted = await uow.repos.offers.updateStatus(made.id, made.version, "ACCEPTED");
    await expect(
      offers.withdraw(summit, made.id, { version: accepted.version }),
    ).rejects.toMatchObject({ code: "OFFER_NOT_OPEN" });
  });
});
