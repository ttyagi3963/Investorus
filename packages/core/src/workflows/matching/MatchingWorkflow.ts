// One matching run (T293; FR-020, FR-022, XII): a listing version against every active buy box,
// in one change. Stage 1 (the repository) narrows to the boxes that could match; stage 2 (the
// evaluator) decides every criterion. Each matched investor gets one Match naming every box that
// matched, one notification per listing version (a match, or "this listing changed"), and one
// audited decision. A run for a stale version or a closed package does nothing, so a retried or
// late job is harmless. A saved buy box is matched the other way round (T321, FR-023): one box
// against every package still taking offers; a package it newly shares is a match like any other,
// and an investor already matched gets the box added and no second notice.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { MatchBuyBoxPayload, MatchPackagePayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Property } from "@clever/contracts/property";
import type { IClock } from "../../providers/clock/IClock.js";
import { evaluateBuyBox, type BuyBoxEvaluation } from "../../registry/evaluate-buy-box.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";
import { notifyInvestor, type InvestorNotice } from "../../outbox/notify-investor.js";

export interface IMatchingWorkflow {
  evaluatePackage(run: MatchPackagePayload): Promise<void>;
  evaluateBuyBox(run: MatchBuyBoxPayload): Promise<void>;
}

type MatchedBox = { box: BuyBox; evaluation: BuyBoxEvaluation };

export class MatchingWorkflow implements IMatchingWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async evaluatePackage({
    packageId,
    round,
    listingVersion,
    trigger,
  }: MatchPackagePayload): Promise<void> {
    const now = this.deps.clock.now();
    const today = now.toISOString().slice(0, 10);

    await this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(packageId);
      // A newer version has its own job, and a withdrawn package is matched no more.
      if (
        pkg?.status !== "ACCEPTING_OFFERS" ||
        pkg.round !== round ||
        pkg.listingVersion !== listingVersion
      ) {
        return;
      }
      const version = await repos.listingVersions.find(packageId, listingVersion);
      if (!version) throw new Error(`Listing version ${listingVersion} of ${packageId} is missing`);
      const facts = version.snapshot;

      const candidates = await repos.buyBoxes.listCandidates(facts.zip, facts.state, now);
      const byInvestor = new Map<string, MatchedBox[]>();
      for (const box of candidates) {
        const evaluation = evaluateBuyBox(box, facts, today);
        if (!evaluation.matched) continue;
        byInvestor.set(box.investorId, [
          ...(byInvestor.get(box.investorId) ?? []),
          { box, evaluation },
        ]);
      }

      const property = await repos.properties.findById(pkg.propertyId);
      for (const [investorId, matched] of byInvestor) {
        const { match, created } = await repos.matches.upsert({
          packageId,
          investorId,
          round,
          matchedBuyBoxIds: matched.map(({ box }) => box.id),
          trigger,
        });
        // Already told about this version: a re-run adds nothing.
        if (!created && (match.lastNotifiedListingVersion ?? 0) >= listingVersion) continue;

        await notifyInvestor(
          repos,
          investorId,
          created ? matchedNotice(pkg, property, matched) : changedNotice(pkg, property),
        );
        await repos.matches.markNotified(match.id, listingVersion);
        await repos.audit.append({
          ...systemEntry(packageId, "MATCH_DECISION"),
          details: {
            investorId,
            round,
            listingVersion,
            evaluatorVersion: EVALUATOR_VERSION,
            buyBoxes: matched.map(({ box, evaluation }) => ({
              id: box.id,
              version: box.version,
              criteria: evaluation.results,
            })),
          },
        });
      }
      await repos.audit.append({
        ...systemEntry(packageId, "MATCHING_COMPLETED"),
        details: {
          round,
          listingVersion,
          evaluatorVersion: EVALUATOR_VERSION,
          candidates: candidates.length,
          matchedCount: byInvestor.size,
        },
      });
    });
  }

  async evaluateBuyBox({ buyBoxId, version }: MatchBuyBoxPayload): Promise<void> {
    const now = this.deps.clock.now();
    const today = now.toISOString().slice(0, 10);

    await this.uow.run(async (repos) => {
      // Saved again, paused, or its investor can no longer be matched: nothing to do.
      const box = await repos.buyBoxes.findMatchable(buyBoxId, version, now);
      if (!box) return;

      for (const pkg of await repos.packages.listOpenForOffers(now)) {
        const listing = await repos.listingVersions.find(pkg.id, pkg.listingVersion);
        if (!listing)
          throw new Error(`Listing version ${pkg.listingVersion} of ${pkg.id} is missing`);
        const evaluation = evaluateBuyBox(box, listing.snapshot, today);
        if (!evaluation.matched) continue;
        // A retried run: this box already shares the package.
        const known = await repos.matches.findOne(pkg.id, box.investorId, pkg.round);
        if (known?.matchedBuyBoxIds.includes(box.id)) continue;

        const { match, created } = await repos.matches.upsert({
          packageId: pkg.id,
          investorId: box.investorId,
          round: pkg.round,
          matchedBuyBoxIds: [box.id],
          trigger: "BUY_BOX_CHANGE",
        });
        if (created) {
          // In the app now; by email only in the daily digest (FR-023).
          const property = await repos.properties.findById(pkg.propertyId);
          await notifyInvestor(
            repos,
            box.investorId,
            matchedNotice(pkg, property, [{ box, evaluation }]),
            { outside: false },
          );
          await repos.matches.markNotified(match.id, pkg.listingVersion);
        }
        await repos.audit.append({
          ...systemEntry(pkg.id, "MATCH_DECISION"),
          details: {
            investorId: box.investorId,
            round: pkg.round,
            listingVersion: pkg.listingVersion,
            evaluatorVersion: EVALUATOR_VERSION,
            trigger: "BUY_BOX_CHANGE",
            buyBoxes: [{ id: box.id, version: box.version, criteria: evaluation.results }],
          },
        });
      }
    });
  }
}

const systemEntry = (packageId: string, action: "MATCH_DECISION" | "MATCHING_COMPLETED") => ({
  actorType: "SYSTEM" as const,
  actorId: null,
  action,
  entityType: "ListingPackage",
  entityId: packageId,
  outcome: "SUCCESS" as const,
});

const deadlineOf = (pkg: ListingPackage) =>
  pkg.offerDeadline ? `${pkg.offerDeadline.toISOString().slice(0, 16).replace("T", " ")} UTC` : "";

function matchedNotice(
  pkg: ListingPackage,
  property: Property | null,
  matched: MatchedBox[],
): InvestorNotice {
  const boxes = matched.map(({ box }) => box.name).join(", ");
  return {
    type: "PACKAGE_MATCHED",
    packageId: pkg.id,
    title: "A new listing matches your buy box",
    body: `A listing in ${placeOf(property)} matches ${boxes}. Offers are due by ${deadlineOf(pkg)}.`,
  };
}

function changedNotice(pkg: ListingPackage, property: Property | null): InvestorNotice {
  return {
    type: "PACKAGE_CHANGED",
    packageId: pkg.id,
    title: "A matched listing changed",
    body: `The listing in ${placeOf(property)} was updated. Review it before you make or revise an offer.`,
  };
}
