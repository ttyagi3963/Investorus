// Guards who sees the seller (T312; FR-031, XII): only the investor whose offer won the package's
// deal gets the seller's contact and the street, and each such read is audited; a backup never
// does; and a buyer whose deal fell through is back to the view without them.
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { DealLifecycleWorkflow } from "../../workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { DecisionWorkflow } from "../../workflows/decision/DecisionWorkflow.js";
import { OfferService } from "../offer/OfferService.js";
import { InvestorPackageQueryService } from "./InvestorPackageQueryService.js";

describe("InvestorPackageQueryService seller reveal", () => {
  it("shows the seller only to the winner, audits each read, and hides it again after a fall-through", async () => {
    const w = world();
    const pkg = await w.publish("12 Elm St", ["summit", "harbor"]);
    const offers = new OfferService(w.uow, { clock: w.clock });
    const winner = await offers.create(investor("summit"), pkg.id, offer());
    await offers.create(investor("harbor"), pkg.id, offer({ price: 270_000 }));
    await new DecisionWorkflow(w.uow, { clock: w.clock }).record(avery, pkg.id, {
      type: "ACCEPT",
      offerId: winner.id,
      version: winner.version,
    });
    const reads = new InvestorPackageQueryService(w.uow);
    const piiReads = () => w.uow.repos.audit.entries.filter((e) => e.action === "PII_ACCESSED");

    const won = await reads.getForInvestor(investor("summit"), pkg.id);
    expect(won.seller).toMatchObject({ fullName: "Maria Lopez", phone: "+15551234567" });
    expect(piiReads()).toEqual([
      expect.objectContaining({ actorId: "user-summit", entityId: pkg.id }),
    ]);
    expect((await reads.getForInvestor(investor("harbor"), pkg.id)).seller).toBeUndefined();

    const deals = new DealLifecycleWorkflow(w.uow, { clock: w.clock });
    const { deal } = await deals.get(avery, pkg.id);
    await deals.fallThrough(avery, deal.id, { reason: "Financing", version: deal.version });
    expect((await reads.getForInvestor(investor("summit"), pkg.id)).seller).toBeUndefined();
    expect(piiReads()).toHaveLength(1);
  });
});
