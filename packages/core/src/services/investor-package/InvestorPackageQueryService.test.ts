// Guards what an investor can see (T295; FR-040, SC-006): only the packages they were matched to,
// newest first, with their own offer status; any other package is "not found", so they learn
// nothing about it; and only investors use these reads.
import { describe, expect, it } from "vitest";
import { avery, investor, offer, world } from "../../../test/fixtures/published-package.js";
import { OfferService } from "../offer/OfferService.js";
import { InvestorPackageQueryService } from "./InvestorPackageQueryService.js";

describe("InvestorPackageQueryService", () => {
  it("lists the investor's matched packages newest first, with their offer status", async () => {
    const { uow, clock, publish } = world();
    const first = await publish("12 Elm St");
    const second = await publish("14 Oak St");
    await new OfferService(uow, { clock }).create(investor("summit"), first.id, offer());
    const reads = new InvestorPackageQueryService(uow);

    const mine = await reads.listMatched(investor("summit"));
    expect(mine.map((p) => [p.package.id, p.myOffer?.status ?? null])).toEqual([
      [second.id, null],
      [first.id, "ACTIVE"],
    ]);
    expect(await reads.listMatched(investor("harbor"))).toEqual([]);
  });

  it("shows a package only to a matched investor, and these reads only to investors", async () => {
    const { uow, publish } = world();
    const pkg = await publish();
    const reads = new InvestorPackageQueryService(uow);

    expect((await reads.getForInvestor(investor("summit"), pkg.id)).package.id).toBe(pkg.id);
    await expect(reads.getForInvestor(investor("harbor"), pkg.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(reads.getForInvestor(investor("summit"), "no-such-package")).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(reads.listMatched(avery)).rejects.toMatchObject({ status: 403 });
  });
});
