// Seeds the Los Angeles listings in la-listings.ts (T314, T373, T409) as the app itself would write
// them: each package through the app's repositories (the seller encrypted, the deadline job queued),
// each published one matched by the real MatchingWorkflow (stored decisions for the ops console's
// "Why?", notices, the version each investor was told about), each offer made through the real
// OfferService (its CRM event and expiry job), and an accepted offer through the DecisionWorkflow
// and DealLifecycleWorkflow. A listing whose address already has a package is skipped, so the seed
// adds nothing when it runs again. Each listing's photos (T420) are Photo rows pointing at the files
// the sandbox stores under packages/seed/; their sizes are read from seed/photos, and a missing file
// stops the seed. Published listings are written straight to ACCEPTING_OFFERS rather than through
// the publish rule, so the empty lot can stay without a photo.
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Actor } from "@clever/contracts/auth";
import type { PhotoContentType } from "@clever/contracts/photo";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { ZIPS } from "../../providers/geo/zips.js";
import type { AddressHasher, IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import { toListingFacts } from "../../registry/listing-facts.js";
import { OfferService } from "../../services/offer/OfferService.js";
import { PrismaUnitOfWorkImpl } from "../../unit-of-work/PrismaUnitOfWorkImpl.js";
import { DealLifecycleWorkflow } from "../../workflows/deal-lifecycle/DealLifecycleWorkflow.js";
import { DecisionWorkflow } from "../../workflows/decision/DecisionWorkflow.js";
import { MatchingWorkflow } from "../../workflows/matching/MatchingWorkflow.js";
import { scheduleRoundClose } from "../../workflows/offer-round/schedule.js";
import { LISTINGS, type SeedListing } from "./la-listings.js";

const DAY = 86_400_000;

type Deps = {
  cipher: IPiiCipher;
  addressHash: AddressHasher;
  /** The folder holding the listings' photo files (seed/photos). */
  photosDir: string;
  now?: Date;
};

const PHOTO_TYPES: Record<string, PhotoContentType> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function seedListings(prisma: PrismaClient, deps: Deps): Promise<void> {
  const now = deps.now ?? new Date();
  const uow = new PrismaUnitOfWorkImpl(prisma, deps.cipher);
  for (const listing of LISTINGS) {
    const addressHash = deps.addressHash({ streetLine: listing.streetLine, zip: listing.zip });
    if (await prisma.listingPackage.findFirst({ where: { addressHash } })) continue;
    await seedListing(prisma, uow, listing, addressHash, now, deps.photosDir);
  }
}

/** A listing's photo rows, main photo first, each pointing at the file the sandbox stores. */
async function photoRows(listing: SeedListing, photosDir: string) {
  return Promise.all(
    (listing.photos ?? []).map(async (file, position) => {
      const contentType = PHOTO_TYPES[extname(file).toLowerCase()];
      if (!contentType) throw new Error(`seed: ${file} is not a JPEG, PNG, or WebP photo`);
      const { size } = await stat(join(photosDir, file));
      return { storageKey: `packages/seed/${file}`, contentType, sizeBytes: size, position };
    }),
  );
}

async function seedListing(
  prisma: PrismaClient,
  uow: PrismaUnitOfWorkImpl,
  listing: SeedListing,
  addressHash: string,
  now: Date,
  photosDir: string,
): Promise<void> {
  const photos = await photoRows(listing, photosDir);
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const date = (days: number) => at(days).toISOString().slice(0, 10);
  const clock = { now: () => now };
  const { id: agentId } = await prisma.agent.findUniqueOrThrow({ where: { email: listing.agent } });
  const agentUser = await prisma.user.findFirstOrThrow({
    where: { agentId },
    select: { id: true },
  });
  const place = ZIPS[listing.zip];
  if (!place) throw new Error(`seed: ZIP ${listing.zip} is not in the ZIP list`);

  const pkg = await uow.run(async (repos) => {
    const seller = await repos.sellers.create(listing.seller);
    const property = await repos.properties.create({
      streetLine: listing.streetLine,
      zip: listing.zip,
      addressHash,
      ...place,
      ...listing.facts,
    });
    const draft = await repos.packages.create({
      agentId,
      sellerId: seller.id,
      propertyId: property.id,
      addressHash,
      priceExpectationMin: listing.priceMin,
      priceExpectationMax: listing.priceMax,
      closingWindowStart: listing.closingWindow && date(listing.closingWindow[0]),
      closingWindowEnd: listing.closingWindow && date(listing.closingWindow[1]),
      currentlyListed: listing.currentlyListed,
      eligiblePrograms: listing.programs,
    });
    const entry = (action: "PACKAGE_CREATED" | "PACKAGE_PUBLISHED") => ({
      actorType: "USER" as const,
      actorId: agentUser.id,
      action,
      entityType: "ListingPackage",
      entityId: draft.id,
      outcome: "SUCCESS" as const,
    });
    await repos.audit.append(entry("PACKAGE_CREATED"));
    for (const photo of photos) await repos.photos.add({ packageId: draft.id, ...photo });
    if (listing.deadlineInDays === null) return null;

    const pkg = await repos.packages.update(draft.id, draft.version, {
      status: "ACCEPTING_OFFERS",
      publishedAt: now,
      offerDeadline: at(listing.deadlineInDays),
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
    await repos.audit.append({ ...entry("PACKAGE_PUBLISHED"), details: { listingVersion: 1 } });
    return pkg;
  });
  if (!pkg) return;

  // Matched as a real publish is: decisions, notices, and the version each investor was told about.
  await new MatchingWorkflow(uow, { clock }).evaluatePackage({
    packageId: pkg.id,
    round: 1,
    listingVersion: 1,
    trigger: "PUBLISH",
  });

  // Each offer as its investor makes it: the CRM event, the agent's notice, the expiry job.
  const offers = new OfferService(uow, { clock });
  const offerIds = new Map<string, { id: string; version: number }>();
  for (const terms of listing.offers ?? []) {
    const investor = await prisma.user.findFirst({
      where: { role: "INVESTOR", investor: { email: terms.investor } },
      select: { id: true, investorId: true },
    });
    if (!investor?.investorId) throw new Error(`seed: investor ${terms.investor} has no login`);
    const offer = await offers.create(
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
    offerIds.set(terms.investor, offer);
  }

  // The seller's choice, recorded by the agent, and the deal taken under contract.
  const accepted = listing.acceptedInvestor && offerIds.get(listing.acceptedInvestor);
  if (accepted) {
    const agent: Actor = { userId: agentUser.id, role: "AGENT", agentId };
    await new DecisionWorkflow(uow, { clock }).record(agent, pkg.id, {
      type: "ACCEPT",
      offerId: accepted.id,
      version: accepted.version,
    });
    const deals = new DealLifecycleWorkflow(uow, { clock });
    const { deal } = await deals.get(agent, pkg.id);
    await deals.recordMilestone(agent, deal.id, {
      milestone: "UNDER_CONTRACT",
      version: deal.version,
    });
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
