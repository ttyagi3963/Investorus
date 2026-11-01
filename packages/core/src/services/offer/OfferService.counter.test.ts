// Guards how an investor answers a counter and keeps a backup offer (T310; FR-052, FR-054):
// accepting a counter takes its terms as the investor's own revision; declining goes back to the
// investor's last own terms and tells the agent; only the offer's investor answers; and a backup
// offer's expiry can move later, even after the deadline, while every other term stays fixed.
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { DecisionWorkflow } from "../../workflows/decision/DecisionWorkflow.js";
import { OfferService } from "./OfferService.js";

const summit = investor("summit");

async function countered() {
  const w = world();
  const pkg = await w.publish("12 Elm St", ["summit", "harbor"]);
  const offers = new OfferService(w.uow, { clock: w.clock });
  const decisions = new DecisionWorkflow(w.uow, { clock: w.clock });
  const made = await offers.create(summit, pkg.id, offer());
  await decisions.record(avery, pkg.id, {
    type: "COUNTER",
    offerId: made.id,
    version: made.version,
    counterTerms: offer({ price: 295_000 }),
  });
  const counter = (await w.uow.repos.offers.findById(made.id))!;
  const agentNotices = async () =>
    (await w.uow.repos.notifications.listForUser(avery.userId)).map((n) => n.type);
  return { ...w, pkg, offers, decisions, counter, agentNotices };
}

describe("OfferService counter responses", () => {
  it("accepting a counter takes its terms as the investor's own revision", async () => {
    const { uow, offers, counter, agentNotices } = await countered();
    const answered = await offers.respondToCounter(summit, counter.id, {
      action: "ACCEPT",
      version: counter.version,
    });

    expect(answered).toMatchObject({ status: "ACTIVE", price: 295_000 });
    expect(uow.repos.offers.revisions.at(-1)).toMatchObject({ author: "INVESTOR" });
    expect(await agentNotices()).toContain("COUNTER_ANSWERED");
  });

  it("declining a counter goes back to the investor's last own terms and tells the agent", async () => {
    const { offers, counter, agentNotices } = await countered();
    const answered = await offers.respondToCounter(summit, counter.id, {
      action: "DECLINE",
      version: counter.version,
    });

    expect(answered).toMatchObject({ status: "ACTIVE", price: 280_000 });
    expect(await agentNotices()).toContain("COUNTER_ANSWERED");
  });

  it("lets only the offer's investor answer", async () => {
    const { offers, counter } = await countered();
    await expect(
      offers.respondToCounter(investor("harbor"), counter.id, {
        action: "ACCEPT",
        version: counter.version,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("OfferService backup offers", () => {
  it("moves a backup offer's expiry later after the deadline, and refuses any other change", async () => {
    const w = world();
    const pkg = await w.publish("12 Elm St", ["summit", "harbor"]);
    const offers = new OfferService(w.uow, { clock: w.clock });
    const backup = await offers.create(summit, pkg.id, offer());
    const winner = await offers.create(investor("harbor"), pkg.id, offer({ price: 290_000 }));
    await new DecisionWorkflow(w.uow, { clock: w.clock }).record(avery, pkg.id, {
      type: "ACCEPT",
      offerId: winner.id,
      version: winner.version,
    });
    const current = (await w.uow.repos.offers.findById(backup.id))!;
    w.clock.at = new Date(pkg.offerDeadline!.getTime() + 1);

    const later = "2026-11-20T12:00:00Z";
    await expect(
      offers.revise(summit, backup.id, {
        ...offer({ price: 300_000, expiresAt: later }),
        version: current.version,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      offers.revise(summit, backup.id, {
        ...offer({ expiresAt: later }),
        version: current.version,
      }),
    ).resolves.toMatchObject({ status: "BACKUP", price: 280_000, expiresAt: new Date(later) });
  });
});
