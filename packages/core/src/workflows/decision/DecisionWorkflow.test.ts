// Guards the seller's decision (T309; FR-052 to FR-054, FR-080): accepting makes a deal, accepts the
// offer, turns the other open offers into backups, moves the package to "Offer accepted", and tells
// every matched investor the outcome, in one change; an expired offer, a stale version, or a second
// accept is refused; a counter is an agent revision only its investor hears about; decline all
// declines every open offer; only the agent decides; and the agent's note stays out of the audit
// log and every notice.
import type { Actor } from "@clever/contracts/auth";
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "../../services/offer/OfferService.js";
import { DecisionWorkflow } from "./DecisionWorkflow.js";

async function setup() {
  const w = world();
  const pkg = await w.publish("12 Elm St", ["summit", "harbor", "ridge"]);
  const offers = new OfferService(w.uow, { clock: w.clock });
  const summit = await offers.create(investor("summit"), pkg.id, offer());
  const harbor = await offers.create(
    investor("harbor"),
    pkg.id,
    offer({ price: 270_000, expiresAt: "2026-11-02T12:00:00Z" }),
  );
  const decisions = new DecisionWorkflow(w.uow, { clock: w.clock });
  const noticesFor = async (name: string) =>
    (await w.uow.repos.notifications.listForUser(`user-${name}`)).map((n) => n.type);
  return { ...w, pkg, summit, harbor, decisions, noticesFor };
}

describe("DecisionWorkflow", () => {
  it("accepts an offer: a deal, the winner ACCEPTED, the rest BACKUP, the package OFFER_ACCEPTED, and everyone told", async () => {
    const { uow, pkg, summit, harbor, decisions, noticesFor } = await setup();

    const decision = await decisions.record(avery, pkg.id, {
      type: "ACCEPT",
      offerId: summit.id,
      version: summit.version,
    });

    expect(uow.repos.deals.rows).toEqual([
      expect.objectContaining({ packageId: pkg.id, offerId: summit.id, status: "OFFER_ACCEPTED" }),
    ]);
    expect((await uow.repos.offers.findById(summit.id))?.status).toBe("ACCEPTED");
    expect((await uow.repos.offers.findById(harbor.id))?.status).toBe("BACKUP");
    expect((await uow.repos.packages.findById(pkg.id))?.status).toBe("OFFER_ACCEPTED");
    expect(uow.repos.audit.entries.at(-1)).toMatchObject({
      action: "DECISION_RECORDED",
      details: { decisionId: decision.id, type: "ACCEPT", backupOfferIds: [harbor.id] },
    });
    expect(await noticesFor("summit")).toContain("OFFER_ACCEPTED");
    expect(await noticesFor("harbor")).toContain("OFFER_BACKUP");
    expect(await noticesFor("ridge")).toContain("PACKAGE_CLOSED_TO_OFFERS");
  });

  it("refuses an expired offer, a stale offer version, and a second accept", async () => {
    const { clock, pkg, summit, harbor, decisions } = await setup();
    const accept = (offerId: string, version: number) =>
      decisions.record(avery, pkg.id, { type: "ACCEPT", offerId, version });

    await expect(accept(summit.id, summit.version + 1)).rejects.toMatchObject({ status: 409 });
    clock.at = new Date("2026-11-02T13:00:00Z");
    await expect(accept(harbor.id, harbor.version)).rejects.toMatchObject({
      code: "OFFER_EXPIRED",
    });
    await accept(summit.id, summit.version);
    await expect(accept(harbor.id, harbor.version + 1)).rejects.toMatchObject({
      code: "PACKAGE_HAS_ACCEPTED_OFFER",
      message: "This package already has an accepted offer",
    });
  });

  it("counters with an agent revision that only that investor hears about", async () => {
    const { uow, pkg, summit, decisions, noticesFor } = await setup();
    await decisions.record(avery, pkg.id, {
      type: "COUNTER",
      offerId: summit.id,
      version: summit.version,
      counterTerms: offer({ price: 295_000 }),
    });

    expect(await uow.repos.offers.findById(summit.id)).toMatchObject({
      status: "COUNTERED",
      price: 295_000,
    });
    expect(uow.repos.offers.revisions.at(-1)).toMatchObject({
      offerId: summit.id,
      author: "AGENT",
    });
    expect(await noticesFor("summit")).toContain("OFFER_COUNTERED");
    expect(await noticesFor("harbor")).not.toContain("OFFER_COUNTERED");
  });

  it("declines every open offer and tells each investor", async () => {
    const { uow, pkg, summit, harbor, decisions, noticesFor } = await setup();
    await decisions.record(avery, pkg.id, { type: "DECLINE_ALL", version: pkg.version });

    for (const id of [summit.id, harbor.id]) {
      expect((await uow.repos.offers.findById(id))?.status).toBe("DECLINED");
    }
    expect(await noticesFor("summit")).toContain("OFFER_DECLINED");
    expect(await noticesFor("harbor")).toContain("OFFER_DECLINED");
  });

  it("lets only the agent decide: operations cannot", async () => {
    const { pkg, summit, decisions } = await setup();
    const ops: Actor = { userId: "user-ops", role: "OPS" };
    await expect(
      decisions.record(ops, pkg.id, {
        type: "ACCEPT",
        offerId: summit.id,
        version: summit.version,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the agent's note out of the audit log and every notice", async () => {
    const { uow, pkg, summit, decisions } = await setup();
    const note = "Maria Lopez wants to close before her move on Dec 3";
    const decision = await decisions.record(avery, pkg.id, {
      type: "ACCEPT",
      offerId: summit.id,
      version: summit.version,
      note,
    });

    expect(decision.note).toBe(note);
    expect(JSON.stringify(uow.repos.audit.entries)).not.toContain("Maria");
    expect(JSON.stringify(uow.repos.notifications.rows)).not.toContain("Maria");
  });
});
