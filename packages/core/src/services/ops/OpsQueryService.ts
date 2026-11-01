// What operations read about packages (T341; FR-073, FR-074): every package with its delivery
// trouble; one package's trace, with who matched and which boxes, whether their notice arrived, what
// they offered, who was not matched, and a timeline of audit entries and deliveries; and why one
// investor was or was not matched. A matched investor's answer is the decision stored when matching
// ran. A non-match is replayed with the current evaluator against the listing version and each box
// as it was when that version was matched, and says so if the rules changed since.
import type { Actor } from "@clever/contracts/auth";
import { CRITERIA, CRITERION_KEYS, type CriterionKey } from "@clever/contracts/buy-box";
import { NotFoundError } from "@clever/contracts/common";
import type {
  CriterionCheck,
  MatchExplanation,
  OpsPackageRow,
  PackageTrace,
  TimelineEntry,
  TraceInvestor,
} from "@clever/contracts/ops";
import { evaluateBuyBox } from "../../registry/evaluate-buy-box.js";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { assertOps } from "./assert-ops.js";
import { auditAddressRead } from "./audit-address-read.js";
import { auditSummary, deliverySummary } from "./timeline-text.js";

const NOT_FOUND = "Package not found";

type CriterionResults = Partial<
  Record<CriterionKey, { passed: boolean; expected: unknown; actual: unknown }>
>;
type StoredDecision = {
  investorId: string;
  round: number;
  listingVersion: number;
  evaluatorVersion: number;
  buyBoxes: { id: string; version: number; criteria: CriterionResults }[];
};

const checks = (results: CriterionResults): CriterionCheck[] =>
  CRITERION_KEYS.flatMap((key) => {
    const result = results[key];
    return result ? [{ key, label: CRITERIA[key].label, ...result }] : [];
  });

export interface IOpsQueryService {
  listPackages(actor: Actor): Promise<OpsPackageRow[]>;
  trace(actor: Actor, packageId: string): Promise<PackageTrace>;
  explainMatch(actor: Actor, packageId: string, investorId: string): Promise<MatchExplanation>;
}

export class OpsQueryService implements IOpsQueryService {
  constructor(private readonly uow: IUnitOfWork) {}

  async listPackages(actor: Actor): Promise<OpsPackageRow[]> {
    assertOps(actor);
    const rows = await this.uow.run(async (repos) => {
      const packages = await repos.opsQuery.listPackages();
      await auditAddressRead(
        repos,
        actor,
        "packages",
        packages.map((p) => p.id),
      );
      return packages;
    });
    return rows.map(({ listingVersion: _version, offerDeadline: _deadline, ...row }) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async trace(actor: Actor, packageId: string): Promise<PackageTrace> {
    assertOps(actor);
    return this.uow.run(async (repos) => {
      const pkg = await repos.opsQuery.findPackage(packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      const audit = await repos.audit.listForEntity("ListingPackage", packageId);
      await auditAddressRead(repos, actor, "trace", [packageId]);
      const matches = await repos.matches.listByPackage(packageId, pkg.round);
      const offers = await repos.offers.listByPackage(packageId, pkg.round);
      const deliveries = await repos.opsQuery.deliveriesForPackage(packageId);
      const investors = await repos.opsQuery.activeInvestors();
      const companies = new Map(investors.map((i) => [i.id, i.companyName]));
      for (const [id, name] of await repos.investors.findCompanyNames(
        matches.map((m) => m.investorId),
      )) {
        companies.set(id, name);
      }

      const decisions = this.decisions(audit, pkg.round);
      const boxNames = await repos.opsQuery.buyBoxNames(matches.flatMap((m) => m.matchedBuyBoxIds));
      const matched: TraceInvestor[] = matches.map((match) => {
        const decided = decisions.get(match.investorId);
        const notice = deliveries.findLast(
          (d) =>
            d.target === "EMAIL" &&
            d.investorId === match.investorId &&
            d.noticeType === "PACKAGE_MATCHED",
        );
        const offer = offers.findLast((o) => o.investorId === match.investorId);
        return {
          investorId: match.investorId,
          companyName: companies.get(match.investorId) ?? match.investorId,
          buyBoxes: match.matchedBuyBoxIds.map((id) => ({
            id,
            name: boxNames.get(id) ?? "A deleted buy box",
            version: decided?.buyBoxes.find((b) => b.id === id)?.version ?? 0,
          })),
          notification: notice ? { status: notice.status, lastError: notice.lastError } : null,
          offer: offer ? { status: offer.status, price: offer.price } : null,
        };
      });
      const matchedIds = new Set(matches.map((m) => m.investorId));
      const completed = audit.findLast(
        (e) =>
          e.action === "MATCHING_COMPLETED" &&
          (e.details as { round?: number }).round === pkg.round,
      );

      const timeline: TimelineEntry[] = [
        ...audit.flatMap((entry) => {
          const summary = auditSummary(entry, companies);
          return summary
            ? [
                {
                  occurredAt: entry.occurredAt.toISOString(),
                  kind: "audit" as const,
                  summary,
                  outcome: entry.outcome,
                  actor: entry.actorType === "SYSTEM" ? "System" : "User",
                },
              ]
            : [];
        }),
        ...deliveries.map((d) => ({
          occurredAt: (d.sentAt ?? d.createdAt).toISOString(),
          kind: "delivery" as const,
          summary: deliverySummary(d, companies),
          outcome: d.status,
          actor: "System",
        })),
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

      return {
        package: {
          id: pkg.id,
          status: pkg.status,
          streetLine: pkg.streetLine,
          city: pkg.city,
          state: pkg.state,
          zip: pkg.zip,
          round: pkg.round,
          listingVersion: pkg.listingVersion,
          offerDeadline: pkg.offerDeadline?.toISOString() ?? null,
        },
        stats: {
          evaluated: completed
            ? Number((completed.details as { candidates: number }).candidates)
            : null,
          matched: matches.length,
          delivered: deliveries.filter((d) => d.status === "SENT").length,
          needsAttention: deliveries.filter((d) => d.status === "NEEDS_ATTENTION").length,
          offers: offers.filter((o) => o.status !== "WITHDRAWN").length,
        },
        matched,
        excluded: investors
          .filter((i) => !matchedIds.has(i.id))
          .map((i) => ({ investorId: i.id, companyName: i.companyName })),
        timeline,
      };
    });
  }

  async explainMatch(
    actor: Actor,
    packageId: string,
    investorId: string,
  ): Promise<MatchExplanation> {
    assertOps(actor);
    return this.uow.run(async (repos) => {
      const pkg = await repos.opsQuery.findPackage(packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      const audit = await repos.audit.listForEntity("ListingPackage", packageId);
      const stored = this.decisions(audit, pkg.round).get(investorId);
      if (stored) return this.fromStored(repos, stored);
      // The boxes are judged as they were when matching ran for this listing version.
      const matchedAt = audit.findLast(
        (e) =>
          e.action === "MATCHING_COMPLETED" &&
          (e.details as { listingVersion?: number }).listingVersion === pkg.listingVersion,
      )?.occurredAt;
      return this.replay(repos, pkg.id, pkg.listingVersion, investorId, matchedAt);
    });
  }

  /**
   * Each investor's stored decisions in the round, merged: a later decision (a buy box saved after
   * publish) adds its box to the earlier ones, and a box decided twice keeps its latest result.
   */
  private decisions(audit: { action: string; details: unknown }[], round: number) {
    const byInvestor = new Map<string, StoredDecision>();
    for (const entry of audit) {
      if (entry.action !== "MATCH_DECISION") continue;
      const decision = entry.details as StoredDecision;
      if (decision.round !== round) continue;
      const earlier = byInvestor.get(decision.investorId);
      const boxes = new Map((earlier?.buyBoxes ?? []).map((box) => [box.id, box]));
      for (const box of decision.buyBoxes) boxes.set(box.id, box);
      byInvestor.set(decision.investorId, { ...decision, buyBoxes: [...boxes.values()] });
    }
    return byInvestor;
  }

  private async fromStored(
    repos: UnitOfWorkRepositories,
    decision: StoredDecision,
  ): Promise<MatchExplanation> {
    const names = await repos.opsQuery.buyBoxNames(decision.buyBoxes.map((b) => b.id));
    return {
      investorId: decision.investorId,
      matched: true,
      listingVersion: decision.listingVersion,
      source: "STORED",
      replayedWithNewerRules: false,
      buyBoxes: decision.buyBoxes.map((box) => ({
        buyBoxId: box.id,
        name: names.get(box.id) ?? "A deleted buy box",
        version: box.version,
        active: true,
        matched: true,
        criteria: checks(box.criteria),
      })),
    };
  }

  private async replay(
    repos: UnitOfWorkRepositories,
    packageId: string,
    listingVersion: number,
    investorId: string,
    matchedAt: Date | undefined,
  ): Promise<MatchExplanation> {
    const listing = await repos.listingVersions.find(packageId, listingVersion);
    const at =
      matchedAt ?? (await repos.opsQuery.listingVersionCreatedAt(packageId, listingVersion));
    if (!listing || !at) throw new NotFoundError("This package has not been matched yet");
    const today = at.toISOString().slice(0, 10);

    const buyBoxes: MatchExplanation["buyBoxes"] = [];
    for (const current of await repos.buyBoxes.listForInvestor(investorId)) {
      const then = await repos.opsQuery.buyBoxVersionAt(current.id, at);
      // A box saved after matching ran had no say in it.
      if (!then) continue;
      const evaluation = evaluateBuyBox(then.box, listing.snapshot, today);
      const active = then.box.status === "ACTIVE";
      buyBoxes.push({
        buyBoxId: current.id,
        name: then.box.name,
        version: then.version,
        active,
        matched: active && evaluation.matched,
        criteria: checks(evaluation.results),
      });
    }
    return {
      investorId,
      matched: false,
      listingVersion,
      source: "REPLAYED",
      replayedWithNewerRules: listing.evaluatorVersion !== EVALUATOR_VERSION,
      buyBoxes,
    };
  }
}
