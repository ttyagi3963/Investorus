// One matching run (T293; FR-020, FR-022, XII): a listing version against every active buy box,
// in one change. Stage 1 (the repository) narrows to the boxes that could match; stage 2 (the
// evaluator) decides every criterion. Each matched investor gets one Match naming every box that
// matched and one audited decision. After a material edit, an investor matched before is told of the
// change only if a field their boxes check changed, even if the listing no longer fits them (FR-022,
// T366). A run for a stale version or a closed package does nothing, so a retried or
// late job is harmless. A saved buy box is matched the other way round (T321, FR-023): one box
// against every package still taking offers; a package it newly shares is a match like any other,
// and an investor already matched gets the box added and no second notice.
import {
  CRITERIA,
  CRITERION_KEYS,
  MATERIAL_FIELDS,
  type BuyBox,
  type CriterionKey,
} from "@clever/contracts/buy-box";
import type { MatchBuyBoxPayload, MatchPackagePayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Property } from "@clever/contracts/property";
import type { IClock } from "../../providers/clock/IClock.js";
import { evaluateBuyBox, type BuyBoxEvaluation } from "../../registry/evaluate-buy-box.js";
import { EVALUATORS, EVALUATOR_VERSION } from "../../registry/evaluators.js";
import type { ListingFacts } from "../../registry/listing-facts.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
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
      // Counts for the agent's summary (T343): the eligible boxes outside the area never reach the
      // evaluator, so they count against geography; every other box counts each criterion it failed.
      const evaluated = await repos.buyBoxes.countMatchable(now);
      const exclusions: Partial<Record<CriterionKey, number>> = {};
      const exclude = (key: CriterionKey, count = 1) => {
        if (count > 0) exclusions[key] = (exclusions[key] ?? 0) + count;
      };
      exclude("geography", evaluated - candidates.length);
      const byInvestor = new Map<string, MatchedBox[]>();
      for (const box of candidates) {
        const evaluation = evaluateBuyBox(box, facts, today);
        if (!evaluation.matched) {
          for (const key of CRITERION_KEYS) if (!evaluation.results[key].passed) exclude(key);
          continue;
        }
        byInvestor.set(box.investorId, [
          ...(byInvestor.get(box.investorId) ?? []),
          { box, evaluation },
        ]);
      }

      const property = await repos.properties.findById(pkg.propertyId);
      // Investors matched and told in this round before. A match never told about the listing is
      // not among them: it is treated as new below and gets the match notice (T373).
      const earlier = new Map(
        (await repos.matches.listByPackage(packageId, round)).flatMap((m) =>
          m.lastNotifiedListingVersion === null ? [] : [[m.investorId, m] as const],
        ),
      );
      // Investors matched in this round before this version: told of the change only if a field
      // their boxes check changed since the version they were last told about, whether or not
      // they still match (FR-022). Newly matched investors are handled below.
      for (const [investorId, prior] of earlier) {
        const lastTold = prior.lastNotifiedListingVersion!;
        // Already told about this version: a re-run adds nothing.
        if (lastTold >= listingVersion) continue;
        const stillMatched = byInvestor.get(investorId) ?? [];
        if (stillMatched.length > 0) {
          await repos.matches.upsert({
            packageId,
            investorId,
            round,
            matchedBuyBoxIds: stillMatched.map(({ box }) => box.id),
            trigger,
          });
        }
        const seen = await repos.listingVersions.find(packageId, lastTold);
        if (!seen) throw new Error(`Listing version ${lastTold} of ${packageId} is missing`);
        const boxes = await boxesOf(repos, prior.matchedBuyBoxIds, stillMatched);
        if (!changedFieldChecked(boxes, seen.snapshot, facts, today)) continue;
        await notifyInvestor(
          repos,
          investorId,
          changedNotice(pkg, property, stillMatched.length > 0),
        );
        await repos.matches.markNotified(prior.id, listingVersion);
        if (stillMatched.length > 0) {
          await repos.audit.append({
            ...systemEntry(packageId, "MATCH_DECISION"),
            details: decisionDetails(investorId, round, listingVersion, stillMatched),
          });
        }
      }

      for (const [investorId, matched] of byInvestor) {
        if (earlier.has(investorId)) continue;
        const { match } = await repos.matches.upsert({
          packageId,
          investorId,
          round,
          matchedBuyBoxIds: matched.map(({ box }) => box.id),
          trigger,
        });
        await notifyInvestor(repos, investorId, matchedNotice(pkg, property, matched));
        await repos.matches.markNotified(match.id, listingVersion);
        await repos.audit.append({
          ...systemEntry(packageId, "MATCH_DECISION"),
          details: decisionDetails(investorId, round, listingVersion, matched),
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
          evaluated,
          exclusions,
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

function changedNotice(
  pkg: ListingPackage,
  property: Property | null,
  stillMatches: boolean,
): InvestorNotice {
  return {
    type: "PACKAGE_CHANGED",
    packageId: pkg.id,
    title: "A matched listing changed",
    body: stillMatches
      ? `The listing in ${placeOf(property)} was updated. Review it before you make or revise an offer.`
      : `The listing in ${placeOf(property)} was updated and no longer fits your buy boxes. Review it before you make or revise an offer.`,
  };
}

const decisionDetails = (
  investorId: string,
  round: number,
  listingVersion: number,
  matched: MatchedBox[],
) => ({
  investorId,
  round,
  listingVersion,
  evaluatorVersion: EVALUATOR_VERSION,
  buyBoxes: matched.map(({ box, evaluation }) => ({
    id: box.id,
    version: box.version,
    criteria: evaluation.results,
  })),
});

/** The boxes that matched the investor before, as they are now, plus those that match now. */
async function boxesOf(
  repos: UnitOfWorkRepositories,
  earlierIds: readonly string[],
  stillMatched: MatchedBox[],
): Promise<BuyBox[]> {
  const boxes = new Map(stillMatched.map(({ box }) => [box.id, box]));
  for (const id of earlierIds) {
    if (boxes.has(id)) continue;
    const box = await repos.buyBoxes.findById(id);
    if (box) boxes.set(id, box);
  }
  return [...boxes.values()];
}

/**
 * Whether any listing field that changed between the two versions is one the boxes check. A box
 * checks a criterion it sets (the registry's evaluator names an expected value; "any" names none),
 * and a criterion reads the listing fields the Criterion Registry lists for it (FR-022).
 */
function changedFieldChecked(
  boxes: BuyBox[],
  before: ListingFacts,
  after: ListingFacts,
  today: string,
): boolean {
  const changed = new Set(
    MATERIAL_FIELDS.filter(
      (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    ),
  );
  if (changed.size === 0) return false;
  return boxes.some((box) =>
    CRITERION_KEYS.some(
      (key) =>
        EVALUATORS[key](box, after, today).expected !== null &&
        CRITERIA[key].listingFields.some((field) => changed.has(field)),
    ),
  );
}
