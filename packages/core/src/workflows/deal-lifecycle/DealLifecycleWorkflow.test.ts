// Guards the deal after acceptance (T311; FR-055 to FR-058): milestones move only in order, mirror
// on the package, reach the buyer, and are audited; closing is final and declines the backups; a
// fall-through closes the winning offer, ranks the backups by net proceeds, and keeps its reason
// from the buyer and the audit log; an expired backup is listed but marked, and only an unexpired
// backup can be promoted, one at a time, with
// 48 hours to reconfirm; reconfirming makes it the accepted offer, and declining or the timeout
// frees the agent to promote another; and the package cannot be reopened while a backup decides,
// but can be with backups left, which are declined and told (T377).
// A promoted backup that is withdrawn or expires is released at once and can never be reconfirmed
// into an accepted offer, which would reveal the seller (T365).
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "../../services/offer/OfferService.js";
import { DecisionWorkflow } from "../decision/DecisionWorkflow.js";
import { OfferRoundWorkflow } from "../offer-round/OfferRoundWorkflow.js";
import { DealLifecycleWorkflow } from "./DealLifecycleWorkflow.js";

async function accepted() {
  const w = world();
  const pkg = await w.publish("12 Elm St", ["summit", "harbor", "ridge"]);
  const offers = new OfferService(w.uow, { clock: w.clock });
  const winner = await offers.create(investor("summit"), pkg.id, offer());
  const harbor = await offers.create(
    investor("harbor"),
    pkg.id,
    offer({ price: 270_000, expiresAt: "2026-11-02T00:00:00Z" }),
  );
  const ridge = await offers.create(investor("ridge"), pkg.id, offer({ price: 275_000 }));
  await new DecisionWorkflow(w.uow, { clock: w.clock }).record(avery, pkg.id, {
    type: "ACCEPT",
    offerId: winner.id,
    version: winner.version,
  });
  const deals = new DealLifecycleWorkflow(w.uow, { clock: w.clock });
  const current = () => deals.get(avery, pkg.id);
  const move = async (milestone: string) => {
    const { deal } = await current();
    return deals.recordMilestone(avery, deal.id, { milestone, version: deal.version });
  };
  const fallThrough = async (reason = "Inspection: foundation") => {
    const { deal } = await current();
    return deals.fallThrough(avery, deal.id, { reason, version: deal.version });
  };
  const promote = async (offerId: string) => {
    const latest = (await w.uow.repos.packages.findById(pkg.id))!;
    return deals.promoteBackup(avery, pkg.id, { offerId, version: latest.version });
  };
  const status = async (id: string) => (await w.uow.repos.offers.findById(id))?.status;
  const notices = async (userId: string) =>
    (await w.uow.repos.notifications.listForUser(userId)).map((n) => n.type);
  return { ...w, pkg, deals, winner, harbor, ridge, move, fallThrough, promote, status, notices };
}

describe("DealLifecycleWorkflow milestones", () => {
  it("moves only in order, mirrors on the package, tells the buyer, and audits each step", async () => {
    const { uow, pkg, move, notices } = await accepted();
    await move("UNDER_CONTRACT");
    await move("INSPECTION");

    await expect(move("CLOSED")).rejects.toMatchObject({
      status: 409,
      details: { allowedNext: ["CLOSING"] },
    });
    expect((await uow.repos.packages.findById(pkg.id))?.status).toBe("INSPECTION");
    expect((await notices("user-summit")).filter((t) => t === "DEAL_MILESTONE")).toHaveLength(2);
    expect(uow.repos.audit.entries.filter((e) => e.action === "DEAL_MILESTONE")).toHaveLength(2);
  });

  it("makes closing final and declines the backups", async () => {
    const { harbor, ridge, move, fallThrough, status } = await accepted();
    for (const milestone of ["UNDER_CONTRACT", "INSPECTION", "CLOSING", "CLOSED"]) {
      await move(milestone);
    }
    expect([await status(harbor.id), await status(ridge.id)]).toEqual(["DECLINED", "DECLINED"]);
    await expect(move("CLOSED")).rejects.toMatchObject({ details: { allowedNext: [] } });
    await expect(fallThrough()).rejects.toMatchObject({ code: "NOT_OPEN_DEAL" });
  });
});

describe("DealLifecycleWorkflow fall-through and backups", () => {
  it("closes the winning offer, ranks the backups by net proceeds, and keeps the reason from the buyer and the audit log", async () => {
    const { uow, pkg, winner, harbor, ridge, fallThrough, status } = await accepted();
    const parts = await fallThrough("Maria Lopez's lender pulled out");

    expect(parts.deal).toMatchObject({ status: "FELL_THROUGH" });
    expect(await status(winner.id)).toBe("FELL_THROUGH");
    expect((await uow.repos.packages.findById(pkg.id))?.status).toBe("FELL_THROUGH");
    expect(parts.backups.map((b) => b.offer.id)).toEqual([ridge.id, harbor.id]);
    expect(JSON.stringify(uow.repos.notifications.rows)).not.toContain("Maria");
    expect(JSON.stringify(uow.repos.audit.entries)).not.toContain("Maria");
  });

  it("promotes only an unexpired backup, one at a time, with 48 hours to reconfirm", async () => {
    const { uow, clock, pkg, deals, publication, harbor, ridge, fallThrough, promote } =
      await accepted();
    await fallThrough();
    clock.at = new Date("2026-11-02T06:00:00Z");

    expect(
      (await deals.get(avery, pkg.id)).backups.find((b) => b.offer.id === harbor.id),
    ).toMatchObject({ expired: true });
    await expect(promote(harbor.id)).rejects.toMatchObject({ code: "OFFER_EXPIRED" });
    const { deal } = await promote(ridge.id);
    const reconfirmBy = new Date(clock.at.getTime() + 48 * 3_600_000);
    expect(deal).toMatchObject({ status: "PENDING_RECONFIRMATION", reconfirmBy });
    expect(uow.repos.jobs.rows.at(-1)).toMatchObject({
      type: "EXPIRE_RECONFIRMATION",
      dedupeKey: `EXPIRE_RECONFIRMATION:${deal.id}`,
      runAt: reconfirmBy,
    });
    await expect(promote(harbor.id)).rejects.toMatchObject({ code: "BACKUP_PENDING" });
    const latest = (await uow.repos.packages.findById(pkg.id))!;
    await expect(
      publication.reopen(avery, pkg.id, {
        version: latest.version,
        offerDeadline: "2026-11-06T12:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "BACKUP_PENDING" });
  });

  it("reopens after a fall-through with a backup left, declining it and telling its investor (T377)", async () => {
    const { uow, pkg, publication, ridge, fallThrough, status, notices } = await accepted();
    await fallThrough();
    const fell = (await uow.repos.packages.findById(pkg.id))!;

    await expect(
      publication.reopen(avery, pkg.id, {
        version: fell.version,
        offerDeadline: "2026-11-06T12:00:00Z",
      }),
    ).resolves.toMatchObject({ package: { status: "ACCEPTING_OFFERS", round: 2 } });
    expect(await status(ridge.id)).toBe("DECLINED");
    expect(await notices("user-ridge")).toContain("OFFER_DECLINED");
  });

  it("makes a reconfirmed backup the accepted offer", async () => {
    const { uow, pkg, deals, ridge, fallThrough, promote, status, notices } = await accepted();
    await fallThrough();
    await promote(ridge.id);

    await deals.reconfirm(investor("ridge"), ridge.id, { action: "CONFIRM" });
    expect((await deals.get(avery, pkg.id)).deal.status).toBe("OFFER_ACCEPTED");
    expect(await status(ridge.id)).toBe("ACCEPTED");
    expect((await uow.repos.packages.findById(pkg.id))?.status).toBe("OFFER_ACCEPTED");
    expect(await notices(avery.userId)).toContain("BACKUP_RECONFIRMED");
  });

  it("refuses a reconfirmation after the deadline, or from another investor", async () => {
    const { clock, deals, ridge, fallThrough, promote } = await accepted();
    await fallThrough();
    const { deal } = await promote(ridge.id);

    await expect(
      deals.reconfirm(investor("harbor"), ridge.id, { action: "CONFIRM" }),
    ).rejects.toMatchObject({ status: 404 });
    clock.at = deal.reconfirmBy!;
    await expect(
      deals.reconfirm(investor("ridge"), ridge.id, { action: "CONFIRM" }),
    ).rejects.toMatchObject({ code: "RECONFIRM_EXPIRED" });
  });

  it("frees the agent to promote another backup when the promoted one declines", async () => {
    const { pkg, deals, harbor, ridge, fallThrough, promote, status, notices } = await accepted();
    await fallThrough();
    await promote(ridge.id);

    await deals.reconfirm(investor("ridge"), ridge.id, { action: "DECLINE" });
    expect((await deals.get(avery, pkg.id)).deal.status).toBe("RECONFIRM_DECLINED");
    expect(await status(ridge.id)).toBe("DECLINED_TO_RECONFIRM");
    expect(await notices(avery.userId)).toContain("RECONFIRMATION_DECLINED");
    await expect(promote(harbor.id)).resolves.toMatchObject({
      deal: { status: "PENDING_RECONFIRMATION" },
    });
  });

  it("releases a promoted backup that is withdrawn or expires, so it can never be reconfirmed", async () => {
    const withdrawn = await accepted();
    await withdrawn.fallThrough();
    const { deal } = await withdrawn.promote(withdrawn.ridge.id);
    const ridgeNow = (await withdrawn.uow.repos.offers.findById(withdrawn.ridge.id))!;
    await new OfferService(withdrawn.uow, { clock: withdrawn.clock }).withdraw(
      investor("ridge"),
      withdrawn.ridge.id,
      { version: ridgeNow.version },
    );

    await expect(
      withdrawn.deals.reconfirm(investor("ridge"), withdrawn.ridge.id, { action: "CONFIRM" }),
    ).rejects.toMatchObject({ code: "NOT_PROMOTED" });
    expect(await withdrawn.status(withdrawn.ridge.id)).toBe("WITHDRAWN");
    expect((await withdrawn.uow.repos.deals.findById(deal.id))?.status).toBe("RECONFIRM_DECLINED");
    expect(await withdrawn.notices(avery.userId)).toContain("RECONFIRMATION_DECLINED");
    await expect(withdrawn.promote(withdrawn.harbor.id)).resolves.toMatchObject({
      deal: { status: "PENDING_RECONFIRMATION" },
    });

    const expired = await accepted();
    await expired.fallThrough();
    await expired.promote(expired.ridge.id);
    const ridgeOffer = (await expired.uow.repos.offers.findById(expired.ridge.id))!;
    await new OfferRoundWorkflow(expired.uow).expireOffer({
      offerId: ridgeOffer.id,
      revision: ridgeOffer.currentRevision,
    });
    await expect(
      expired.deals.reconfirm(investor("ridge"), expired.ridge.id, { action: "CONFIRM" }),
    ).rejects.toMatchObject({ code: "NOT_PROMOTED" });
    expect(await expired.status(expired.ridge.id)).toBe("EXPIRED");
  });

  it("refuses to reconfirm a promoted backup whose offer has passed its expiry", async () => {
    const { clock, deals, harbor, fallThrough, promote, status } = await accepted();
    await fallThrough();
    await promote(harbor.id);
    clock.at = new Date("2026-11-02T06:00:00Z");

    await expect(
      deals.reconfirm(investor("harbor"), harbor.id, { action: "CONFIRM" }),
    ).rejects.toMatchObject({ code: "OFFER_EXPIRED" });
    expect(await status(harbor.id)).toBe("BACKUP");
  });

  it("times out a backup that has not answered, and leaves one that reconfirmed alone", async () => {
    const pending = await accepted();
    await pending.fallThrough();
    const { deal } = await pending.promote(pending.ridge.id);
    await pending.deals.expireReconfirmation({ dealId: deal.id });
    expect(await pending.status(pending.ridge.id)).toBe("DECLINED_TO_RECONFIRM");

    const answered = await accepted();
    await answered.fallThrough();
    const promoted = await answered.promote(answered.ridge.id);
    await answered.deals.reconfirm(investor("ridge"), answered.ridge.id, { action: "CONFIRM" });
    await answered.deals.expireReconfirmation({ dealId: promoted.deal.id });
    expect(await answered.status(answered.ridge.id)).toBe("ACCEPTED");
  });
});
