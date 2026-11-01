// Guards which changes reach the outside world (T337; FR-077, FR-022, FR-023): every package status
// change, whichever workflow makes it, writes one CRM event with the listing's snapshot in the same
// change, and an update that keeps the status writes none; an investor notice goes to email (and
// SMS when urgent) by its type, never for a buy-box-change match (that waits for the digest), and
// never for a notice that stays in the app.
import type { OfferTerms } from "@clever/contracts/offer";
import type { NewListingPackage } from "../repositories/listing-package/IListingPackageRepository.js";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../test/doubles/InMemoryRepositories.js";
import { notifyInvestor } from "./notify-investor.js";

const NEW_PACKAGE: NewListingPackage = {
  agentId: "agent-1",
  sellerId: "seller-1",
  propertyId: "property-1",
  addressHash: "hash-1",
  priceExpectationMin: 200_000,
  priceExpectationMax: 250_000,
  closingWindowStart: null,
  closingWindowEnd: null,
  currentlyListed: false,
  eligiblePrograms: ["CASH_OFFER"],
};

const TERMS: Omit<OfferTerms, "price"> = {
  paymentType: "CASH",
  closingDate: "2026-12-01",
  earnestMoney: 5_000,
  contingencies: [],
  feesAndConcessions: 0,
  expiresAt: new Date("2026-11-10T00:00:00Z"),
};

function setup() {
  const uow = new InMemoryUnitOfWork([
    {
      user: {
        id: "user-i",
        email: "i@example.test",
        displayName: "Investor",
        role: "INVESTOR",
        agentId: null,
        investorId: "investor-1",
        active: true,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      passwordHash: "x",
    },
  ]);
  return { uow, events: uow.repos.outbox.rows };
}

describe("package status events", () => {
  it("writes one CRM event with the snapshot per status change, and none when it stays", async () => {
    const { uow, events } = setup();
    const pkg = await uow.run((repos) => repos.packages.create(NEW_PACKAGE));
    const published = await uow.run((repos) =>
      repos.packages.update(pkg.id, pkg.version, { status: "ACCEPTING_OFFERS" }),
    );
    const offer = await uow.run((repos) =>
      repos.offers.create({
        ...TERMS,
        price: 240_000,
        packageId: pkg.id,
        investorId: "investor-1",
        round: 1,
      }),
    );
    await uow.run((repos) =>
      repos.deals.create({ packageId: pkg.id, offerId: offer.id, status: "OFFER_ACCEPTED" }),
    );
    const accepted = await uow.run((repos) =>
      repos.packages.update(pkg.id, published.version, { status: "OFFER_ACCEPTED" }),
    );
    await uow.run((repos) =>
      repos.packages.update(pkg.id, accepted.version, { priceExpectationMax: 260_000 }),
    );

    expect(events.map((e) => [e.type, e.payload])).toEqual([
      [
        "package.status_changed",
        {
          packageId: pkg.id,
          from: "DRAFT",
          crm: { status: "ACCEPTING_OFFERS", round: 1, offerCount: 0, acceptedPrice: null },
        },
      ],
      [
        "package.status_changed",
        {
          packageId: pkg.id,
          from: "ACCEPTING_OFFERS",
          crm: { status: "OFFER_ACCEPTED", round: 1, offerCount: 1, acceptedPrice: 240_000 },
        },
      ],
    ]);
  });
});

describe("notifyInvestor", () => {
  const notice = (type: "PACKAGE_MATCHED" | "OFFER_EXPIRED") => ({
    type,
    packageId: "package-1",
    title: "A listing matched your buy box",
    body: "A listing in Austin, TX 78745 matched.",
  });

  it("sends an urgent notice by email and SMS, in the app as well", async () => {
    const { uow, events } = setup();
    await uow.run((repos) => notifyInvestor(repos, "investor-1", notice("PACKAGE_MATCHED")));

    expect(uow.repos.notifications.rows).toHaveLength(1);
    expect(events).toEqual([
      expect.objectContaining({
        type: "investor.notice",
        payload: expect.objectContaining({ investorId: "investor-1", channels: ["EMAIL", "SMS"] }),
      }),
    ]);
  });

  it("keeps a buy-box-change match and an in-app-only notice inside the app", async () => {
    const { uow, events } = setup();
    await uow.run(async (repos) => {
      await notifyInvestor(repos, "investor-1", notice("PACKAGE_MATCHED"), { outside: false });
      await notifyInvestor(repos, "investor-1", notice("OFFER_EXPIRED"));
    });

    expect(uow.repos.notifications.rows).toHaveLength(2);
    expect(events).toEqual([]);
  });
});
