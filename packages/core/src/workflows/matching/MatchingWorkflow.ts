// One matching run (T293; FR-020, FR-022, XII): a listing version against every active buy box,
// in one change. Stage 1 (the repository) narrows to the boxes that could match; stage 2 (the
// evaluator) decides every criterion. Each matched investor gets one Match naming every box that
// matched, one notification per listing version (a match, or "this listing changed"), and one
// audited decision. A run for a stale version or a closed package does nothing, so a retried or
// late job is harmless.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { MatchPackagePayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Property } from "@clever/contracts/property";
import type { IClock } from "../../providers/clock/IClock.js";
import { evaluateBuyBox, type BuyBoxEvaluation } from "../../registry/evaluate-buy-box.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import type { NewNotification } from "../../repositories/notification/INotificationRepository.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";

export interface IMatchingWorkflow {
  evaluatePackage(run: MatchPackagePayload): Promise<void>;
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

        const userId = await repos.users.findIdByInvestorId(investorId);
        if (userId) {
          await repos.notifications.create(
            created
              ? matchedNotice(userId, pkg, property, matched)
              : changedNotice(userId, pkg, property),
          );
        }
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
  userId: string,
  pkg: ListingPackage,
  property: Property | null,
  matched: MatchedBox[],
): NewNotification {
  const boxes = matched.map(({ box }) => box.name).join(", ");
  return {
    userId,
    type: "PACKAGE_MATCHED",
    packageId: pkg.id,
    title: "A new listing matches your buy box",
    body: `A listing in ${placeOf(property)} matches ${boxes}. Offers are due by ${deadlineOf(pkg)}.`,
  };
}

function changedNotice(
  userId: string,
  pkg: ListingPackage,
  property: Property | null,
): NewNotification {
  return {
    userId,
    type: "PACKAGE_CHANGED",
    packageId: pkg.id,
    title: "A matched listing changed",
    body: `The listing in ${placeOf(property)} was updated. Review it before you make or revise an offer.`,
  };
}
