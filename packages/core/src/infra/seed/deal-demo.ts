// The deal demo the reviewer opens as blake@example.com (T314): one published package in Austin,
// matched to four investors whose buy boxes really fit it, each with an offer that differs in
// price, payment, contingencies, and closing date, so the comparison and the decision work at once.
// The package is written through the app's own repositories (the seller encrypted, the deadline job
// queued). It is then matched by the real MatchingWorkflow, so each match has its stored decision
// (the ops console's "Why?"), its notice, and the version its investor was told about; and the offers
// are made through the real OfferService, so each writes its CRM event and expiry job (T373). It
// runs once (skipped when Blake has a package).
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { AddressHasher, IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import { toListingFacts } from "../../registry/listing-facts.js";
import { OfferService } from "../../services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../../unit-of-work/PrismaUnitOfWorkImpl.js";
import { MatchingWorkflow } from "../../workflows/matching/MatchingWorkflow.js";
import { scheduleRoundClose } from "../../workflows/offer-round/schedule.js";

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
  const users = await prisma.user.findMany({ where: { agentId: blake.id } });
  const clock = { now: () => now };

  const uow = new PrismaUnitOfWorkImpl(prisma, deps.cipher);
  const pkg = await uow.run(async (repos) => {
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
    const entry = (action: "PACKAGE_CREATED" | "PACKAGE_PUBLISHED") => ({
      actorType: "USER" as const,
      actorId: users[0]?.id ?? null,
      action,
      entityType: "ListingPackage",
      entityId: pkg.id,
      outcome: "SUCCESS" as const,
    });
    await repos.audit.append(entry("PACKAGE_CREATED"));
    await repos.audit.append({ ...entry("PACKAGE_PUBLISHED"), details: { listingVersion: 1 } });

    return pkg;
  });

  // Matched as a real publish is: decisions, notices, and the version each investor was told about.
  await new MatchingWorkflow(uow, { clock }).evaluatePackage({
    packageId: pkg.id,
    round: 1,
    listingVersion: 1,
    trigger: "PUBLISH",
  });

  // Each offer as its investor makes it: the CRM event, the agent's notice, the expiry job.
  const offers = new OfferService(uow, { clock });
  for (const terms of OFFERS) {
    const investor = await prisma.user.findFirst({
      where: { role: "INVESTOR", investor: { email: terms.investor } },
      select: { id: true, investorId: true },
    });
    if (!investor?.investorId) throw new Error(`seed: investor ${terms.investor} has no login`);
    await offers.create(
      { userId: investor.id, role: "INVESTOR", investorId: investor.investorId },
      pkg.id,
      {
        price: terms.price,
        paymentType: terms.paymentType,
        contingencies: [...terms.contingencies],
        closingDate: date(terms.closingInDays),
        earnestMoney: terms.earnestMoney,
        feesAndConcessions: terms.feesAndConcessions,
        expiresAt: at(terms.expiresInDays).toISOString(),
      },
    );
  }
}

/** The settings the comparison and backup promotions read (constitution IX); ops edits come later. */
export async function seedConfig(prisma: PrismaClient): Promise<void> {
  const entries: { key: string; value: Prisma.InputJsonValue }[] = [
    { key: "netProceeds", value: { closingCostPct: 0.02, flatFees: 1_500 } },
    { key: "reconfirmHours", value: 48 },
    // About five minutes of retries before a delivery needs attention (contracts/events.md).
    {
      key: "deliveryRetry",
      value: { baseMs: 2_000, factor: 2, capMs: 60_000, jitter: 0.2, attempts: 10 },
    },
    { key: "matchDigest", value: { hourUtc: 14 } },
  ];
  for (const { key, value } of entries) {
    await prisma.configEntry.upsert({ where: { key }, create: { key, value }, update: {} });
  }
}
