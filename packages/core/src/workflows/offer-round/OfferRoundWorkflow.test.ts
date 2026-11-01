// Guards the offer round's timers (T306; FR-044, FR-059): at the deadline a round with no open
// offers moves to "No offers received" and the agent is told, while a round with offers stays open
// for the decision; a job for a deadline that was since extended does nothing; and each offer
// revision expires on its own schedule, so an older revision's job does nothing and an accepted
// offer never expires.
import type { CloseOfferRoundPayload, ExpireOfferPayload } from "@clever/contracts/jobs";
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "../../services/offer/OfferService.js";
import { OfferRoundWorkflow } from "./OfferRoundWorkflow.js";

const summit = investor("summit");

function setup() {
  const w = world();
  const offers = new OfferService(w.uow, { clock: w.clock });
  const round = new OfferRoundWorkflow(w.uow);
  const jobs = <P>(type: string) =>
    w.uow.repos.jobs.rows.filter((j) => j.type === type).map((j) => j.payload as P);
  return { ...w, offers, round, jobs };
}

describe("OfferRoundWorkflow", () => {
  it("at the deadline, moves a round with no open offers to NO_OFFERS_RECEIVED and tells the agent; a round with an offer stays open", async () => {
    const { uow, offers, round, publish, jobs } = setup();
    const empty = await publish("12 Elm St");
    const withOffer = await publish("14 Oak St");
    await offers.create(summit, withOffer.id, offer());

    for (const payload of jobs<CloseOfferRoundPayload>("CLOSE_OFFER_ROUND")) {
      await round.closeRound(payload);
    }

    expect((await uow.repos.packages.findById(empty.id))?.status).toBe("NO_OFFERS_RECEIVED");
    expect((await uow.repos.packages.findById(withOffer.id))?.status).toBe("ACCEPTING_OFFERS");
    expect(await uow.repos.notifications.listForUser(avery.userId)).toEqual([
      expect.objectContaining({ packageId: withOffer.id, title: "Offers are ready to compare" }),
      expect.objectContaining({ packageId: empty.id, title: "No offers came in" }),
    ]);
  });

  it("does nothing for a deadline that was extended since", async () => {
    const { uow, clock, publication, round, publish, jobs } = setup();
    const pkg = await publish();
    const [first] = jobs<CloseOfferRoundPayload>("CLOSE_OFFER_ROUND");
    const later = new Date(pkg.offerDeadline!.getTime() + 24 * 3_600_000);
    await publication.extendDeadline(avery, pkg.id, {
      version: pkg.version,
      offerDeadline: later.toISOString(),
    });

    clock.at = pkg.offerDeadline!;
    await round.closeRound(first!);
    expect((await uow.repos.packages.findById(pkg.id))?.status).toBe("ACCEPTING_OFFERS");
    expect(jobs<CloseOfferRoundPayload>("CLOSE_OFFER_ROUND").at(-1)?.offerDeadline).toBe(
      later.toISOString(),
    );
  });

  it("expires an open offer at its revision's expiry and tells the investor; an older revision's job does nothing", async () => {
    const { uow, offers, round, publish, jobs } = setup();
    const pkg = await publish();
    const made = await offers.create(summit, pkg.id, offer());
    await offers.revise(summit, made.id, {
      ...offer({ price: 285_000, expiresAt: "2026-11-04T12:00:00Z" }),
      version: made.version,
    });
    const [first, second] = jobs<ExpireOfferPayload>("EXPIRE_OFFER");

    await round.expireOffer(first!);
    expect((await uow.repos.offers.findById(made.id))?.status).toBe("ACTIVE");
    await round.expireOffer(second!);
    expect((await uow.repos.offers.findById(made.id))?.status).toBe("EXPIRED");
    expect(await uow.repos.notifications.listForUser(summit.userId)).toContainEqual(
      expect.objectContaining({ type: "OFFER_EXPIRED", packageId: pkg.id }),
    );
  });

  it("never expires an accepted offer", async () => {
    const { uow, offers, round, publish, jobs } = setup();
    const pkg = await publish();
    const made = await offers.create(summit, pkg.id, offer());
    await uow.repos.offers.updateStatus(made.id, made.version, "ACCEPTED");

    await round.expireOffer(jobs<ExpireOfferPayload>("EXPIRE_OFFER")[0]!);
    expect((await uow.repos.offers.findById(made.id))?.status).toBe("ACCEPTED");
  });
});
