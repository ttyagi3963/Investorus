// The deal demo the reviewer opens as blake@example.com (T314): one published package in Austin,
// matched to four investors whose buy boxes really fit it, each with an offer that differs in
// price, payment, contingencies, and closing date, so the comparison and the decision work at once.
// It is written through the app's own repositories, so the seller is encrypted and the deadline and
// expiry jobs are queued as a real publish would; it runs once (skipped when Blake has a package).
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { AddressHasher, IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import { toListingFacts } from "../../registry/listing-facts.js";
import { PrismaUnitOfWorkImpl } from "../../unit-of-work/PrismaUnitOfWorkImpl.js";
import { scheduleOfferExpiry, scheduleRoundClose } from "../../workflows/offer-round/schedule.js";

const DAY = 86_400_000;

/** Each offer, by the investor's email; dates are days from the seed run. */
const OFFERS = [
  {
    investor: "summit@example.com",
    price: 285_000,
    paymentType: "CASH",
    contingencies: ["INSPECTION"],
    closingInDays: 30,
    earnestMoney: 5_000,
    feesAndConcessions: 0,
    expiresInDays: 5,
  },
  {
    investor: "harbor@example.com",
    price: 295_000,
    paymentType: "FINANCED",
    contingencies: ["FINANCING", "APPRAISAL", "INSPECTION"],
    closingInDays: 45,
    earnestMoney: 10_000,
    feesAndConcessions: 7_500,
    expiresInDays: 6,
  },
  {
    investor: "cobalt@example.com",
    price: 278_000,
    paymentType: "CASH",
    contingencies: [],
    closingInDays: 14,
    earnestMoney: 15_000,
    feesAndConcessions: 0,
    expiresInDays: 7,
  },
  {
    investor: "dune@example.com",
    price: 290_000,
    paymentType: "CASH",
    contingencies: ["INSPECTION", "TITLE"],
    closingInDays: 21,
    earnestMoney: 7_500,
    feesAndConcessions: 3_000,
    expiresInDays: 4,
  },
] as const;

export async function seedDealDemo(
  prisma: PrismaClient,
  deps: { cipher: IPiiCipher; addressHash: AddressHasher; now?: Date },
): Promise<void> {
  const blake = await prisma.agent.findUniqueOrThrow({ where: { email: "blake@example.com" } });
  if ((await prisma.listingPackage.count({ where: { agentId: blake.id } })) > 0) return;
  const now = deps.now ?? new Date();
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const date = (days: number) => at(days).toISOString().slice(0, 10);
  const investors = await prisma.investor.findMany({
    where: { email: { in: OFFERS.map((o) => o.investor) } },
  });
  const users = await prisma.user.findMany({ where: { agentId: blake.id } });

  const uow = new PrismaUnitOfWorkImpl(prisma, deps.cipher);
  await uow.run(async (repos) => {
    const seller = await repos.sellers.create({
      fullName: "Jordan Rivera",
      email: "jordan.rivera@example.net",
      phone: "+15125550142",
    });
    const address = { streetLine: "48 Maple Ave", zip: "78745" };
    const addressHash = deps.addressHash(address);
    const property = await repos.properties.create({
      ...address,
      addressHash,
      city: "Austin",
      state: "TX",
      neighborhood: "Southwest Austin",
      propertyType: "SINGLE_FAMILY",
      beds: 3,
      baths: 2,
      sqft: 1_450,
      lotSqft: 6_500,
      units: null,
      yearBuilt: 1978,
      condition: "FAIR",
      repairEstimate: 30_000,
    });
    const draft = await repos.packages.create({
      agentId: blake.id,
      sellerId: seller.id,
      propertyId: property.id,
      addressHash,
      priceExpectationMin: 260_000,
      priceExpectationMax: 300_000,
      closingWindowStart: date(14),
      closingWindowEnd: date(60),
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
    });
    const pkg = await repos.packages.update(draft.id, draft.version, {
      status: "ACCEPTING_OFFERS",
      publishedAt: now,
      offerDeadline: at(3),
      listingVersion: 1,
    });
    await repos.listingVersions.append({
      packageId: pkg.id,
      listingVersion: 1,
      round: 1,
      snapshot: toListingFacts(pkg, property),
      evaluatorVersion: EVALUATOR_VERSION,
    });
    await scheduleRoundClose(repos, pkg);
    const entry = (action: "PACKAGE_CREATED" | "PACKAGE_PUBLISHED" | "OFFER_SUBMITTED") => ({
      actorType: "USER" as const,
      actorId: users[0]?.id ?? null,
      action,
      entityType: "ListingPackage",
      entityId: pkg.id,
      outcome: "SUCCESS" as const,
    });
    await repos.audit.append(entry("PACKAGE_CREATED"));
    await repos.audit.append({ ...entry("PACKAGE_PUBLISHED"), details: { listingVersion: 1 } });

    for (const terms of OFFERS) {
      const investor = investors.find((i) => i.email === terms.investor);
      if (!investor) throw new Error(`seed: investor ${terms.investor} is missing`);
      // Each of these investors has a buy box that matches the listing (seed.ts).
      await repos.matches.upsert({
        packageId: pkg.id,
        investorId: investor.id,
        round: 1,
        matchedBuyBoxIds: (
          await prisma.buyBox.findMany({ where: { investorId: investor.id }, select: { id: true } })
        ).map((box) => box.id),
        trigger: "PUBLISH",
      });
      const offer = await repos.offers.create({
        packageId: pkg.id,
        investorId: investor.id,
        round: 1,
        price: terms.price,
        paymentType: terms.paymentType,
        contingencies: [...terms.contingencies],
        closingDate: date(terms.closingInDays),
        earnestMoney: terms.earnestMoney,
        feesAndConcessions: terms.feesAndConcessions,
        expiresAt: at(terms.expiresInDays),
      });
      await scheduleOfferExpiry(repos, offer);
      await repos.audit.append({
        ...entry("OFFER_SUBMITTED"),
        actorId: null,
        actorType: "SYSTEM",
        details: { offerId: offer.id, revision: 1, price: offer.price },
      });
    }
  });
}

/** The settings the comparison and backup promotions read (constitution IX); ops edits come later. */
export async function seedConfig(prisma: PrismaClient): Promise<void> {
  const entries: { key: string; value: Prisma.InputJsonValue }[] = [
    { key: "netProceeds", value: { closingCostPct: 0.02, flatFees: 1_500 } },
    { key: "reconfirmHours", value: 48 },
  ];
  for (const { key, value } of entries) {
    await prisma.configEntry.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}
