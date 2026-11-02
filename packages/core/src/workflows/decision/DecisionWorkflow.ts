// The seller's decision, recorded by the agent (T309; FR-052 to FR-054): accept one offer, counter
// one, or decline all. Accept inserts the Deal first, so of two concurrent accepts the second
// waits on the one-active-deal index and is refused; then the winner is ACCEPTED, every other open
// offer becomes a backup, the package moves to OFFER_ACCEPTED, and every matched investor learns
// the outcome. A counter is an agent revision only that investor sees. Decline all closes every
// open offer; before the deadline the round stays open for new offers, and after it the package
// has no offers left, so it moves to NO_OFFERS_RECEIVED to be extended, reopened, or withdrawn
// (T377). Each decision is an append-only row and an audit entry, in one change; its note stays
// with the agent (encrypted at rest, never in a notice or the audit details).
import type { Actor } from "@clever/contracts/auth";
import { BusinessRuleError, ConflictError, NotFoundError } from "@clever/contracts/common";
import { createDecisionSchema, type Decision } from "@clever/contracts/deal";
import type { ListingPackage, PackageStatus } from "@clever/contracts/listing-package";
import type { Offer } from "@clever/contracts/offer";
import type { IClock } from "../../providers/clock/IClock.js";
import { ALREADY_ACCEPTED } from "../../repositories/deal/IDealRepository.js";
import { agentOf } from "../../services/actor-guards.js";
import { checkOfferDates } from "../../services/offer/offer-terms.js";
import type { UnitOfWorkRepositories, IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";
import { scheduleOfferExpiry } from "../offer-round/schedule.js";
import { notifyInvestor, type InvestorNotice } from "../../outbox/notify-investor.js";

export interface IDecisionWorkflow {
  record(actor: Actor, packageId: string, input: unknown): Promise<Decision>;
}

/** The statuses a package holds while a deal is on (data-model.md, PackageStatus). */
const DEAL_STATUSES: PackageStatus[] = [
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
];

type Notice = InvestorNotice;

export class DecisionWorkflow implements IDecisionWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async record(actor: Actor, packageId: string, input: unknown): Promise<Decision> {
    // The seller decides through their agent; operations can see but never decide (FR-080).
    const agentId = agentOf(actor, "Only the package's agent records the seller's decision");
    const data = createDecisionSchema.parse(input);
    const now = this.deps.clock.now();
    const counterTerms =
      data.type === "COUNTER" ? checkOfferDates(data.counterTerms, now, "counterTerms.") : null;

    return this.uow.run(async (repos) => {
      // Decisions on one package run one at a time: a second accept waits here, then reads the
      // package as the first left it and is told an offer was already accepted.
      await repos.packages.lock(packageId);
      const pkg = await repos.packages.findForAgent(agentId, packageId);
      if (!pkg) throw new NotFoundError("Package not found");
      if (DEAL_STATUSES.includes(pkg.status)) {
        throw new BusinessRuleError(ALREADY_ACCEPTED, "PACKAGE_HAS_ACCEPTED_OFFER");
      }
      if (pkg.status !== "ACCEPTING_OFFERS") {
        throw new BusinessRuleError("This package has no offers to decide on", "NOT_DECIDING");
      }
      const place = placeOf(await repos.properties.findById(pkg.propertyId));
      const notify = (investorId: string, notice: Notice) => this.notify(repos, investorId, notice);

      let details: Record<string, unknown>;
      if (data.type === "DECLINE_ALL") {
        // The package's version guards a decline made from a stale screen. After the deadline no
        // new offer can come, so the round ends here as if none had come (T377).
        const roundOver = pkg.offerDeadline !== null && now >= pkg.offerDeadline;
        await repos.packages.update(
          packageId,
          data.version,
          roundOver ? { status: "NO_OFFERS_RECEIVED" } : {},
        );
        const declined = await repos.offers.declineOpen(packageId, pkg.round);
        for (const offer of declined) {
          await notify(offer.investorId, {
            type: "OFFER_DECLINED",
            packageId,
            title: "Your offer was declined",
            body: `The seller declined the offers on the listing in ${place}.`,
          });
        }
        details = { declinedOfferIds: declined.map((o) => o.id) };
      } else {
        const offer = await this.offerOn(repos, pkg, data.offerId, data.version);
        if (data.type === "ACCEPT") {
          details = await this.accept(repos, pkg, offer, place, now);
        } else {
          if (offer.status !== "ACTIVE" && offer.status !== "COUNTERED") {
            throw new BusinessRuleError("Only an open offer can be countered", "OFFER_NOT_OPEN");
          }
          const countered = await repos.offers.revise(offer.id, offer.version, counterTerms!, {
            author: "AGENT",
            status: "COUNTERED",
          });
          await scheduleOfferExpiry(repos, countered);
          await notify(offer.investorId, {
            type: "OFFER_COUNTERED",
            packageId,
            title: "The seller countered your offer",
            body: `The seller sent new terms for the listing in ${place}. Accept them, decline them, or revise your offer.`,
          });
          details = { offerId: offer.id, revision: countered.currentRevision };
        }
      }

      const decision = await repos.decisions.append({
        packageId,
        round: pkg.round,
        type: data.type,
        offerId: data.type === "DECLINE_ALL" ? null : data.offerId,
        actorUserId: actor.userId,
        note: data.note ?? null,
      });
      await repos.audit.append({
        actorType: "USER",
        actorId: actor.userId,
        action: "DECISION_RECORDED",
        entityType: "ListingPackage",
        entityId: packageId,
        outcome: "SUCCESS",
        details: { decisionId: decision.id, type: data.type, ...details },
      });
      return decision;
    });
  }

  /** Accepts the offer: the deal first (the race guard), then every status, then the notices. */
  private async accept(
    repos: UnitOfWorkRepositories,
    pkg: ListingPackage,
    offer: Offer,
    place: string,
    now: Date,
  ): Promise<Record<string, unknown>> {
    if (offer.status !== "ACTIVE") {
      throw new BusinessRuleError("Only an active offer can be accepted", "OFFER_NOT_ACCEPTABLE");
    }
    if (offer.expiresAt <= now) {
      throw new BusinessRuleError("This offer has expired and cannot be accepted", "OFFER_EXPIRED");
    }
    await repos.deals.create({ packageId: pkg.id, offerId: offer.id, status: "OFFER_ACCEPTED" });
    await repos.offers.updateStatus(offer.id, offer.version, "ACCEPTED");
    const backups: Offer[] = [];
    for (const other of await repos.offers.listByPackage(pkg.id, pkg.round)) {
      if (other.id === offer.id || (other.status !== "ACTIVE" && other.status !== "COUNTERED")) {
        continue;
      }
      backups.push(await repos.offers.updateStatus(other.id, other.version, "BACKUP"));
    }
    await repos.packages.update(pkg.id, pkg.version, { status: "OFFER_ACCEPTED" });

    // Every investor with a stake learns the outcome (FR-054).
    const told = new Set([offer.investorId, ...backups.map((b) => b.investorId)]);
    await this.notify(repos, offer.investorId, {
      type: "OFFER_ACCEPTED",
      packageId: pkg.id,
      title: "Your offer was accepted",
      body: `The seller accepted your offer on the listing in ${place}. The seller's contact details are now on the listing.`,
    });
    for (const backup of backups) {
      await this.notify(repos, backup.investorId, {
        type: "OFFER_BACKUP",
        packageId: pkg.id,
        title: "Your offer is now a backup offer",
        body: `The seller accepted another offer on the listing in ${place}. Yours stays as a backup in case that deal falls through; you can withdraw it at any time.`,
      });
    }
    for (const match of await repos.matches.listByPackage(pkg.id, pkg.round)) {
      if (told.has(match.investorId)) continue;
      await this.notify(repos, match.investorId, {
        type: "PACKAGE_CLOSED_TO_OFFERS",
        packageId: pkg.id,
        title: "A matched listing accepted an offer",
        body: `The listing in ${place} accepted an offer and no longer takes new ones.`,
      });
    }
    return { offerId: offer.id, backupOfferIds: backups.map((b) => b.id) };
  }

  /** The offer must be on this package's current round, at the version the agent read. */
  private async offerOn(
    repos: UnitOfWorkRepositories,
    pkg: ListingPackage,
    offerId: string,
    version: number,
  ): Promise<Offer> {
    const offer = await repos.offers.findById(offerId);
    if (!offer || offer.packageId !== pkg.id || offer.round !== pkg.round) {
      throw new NotFoundError("Offer not found");
    }
    if (offer.version !== version) {
      throw new ConflictError("This offer changed since you opened it. Reload and try again.");
    }
    return offer;
  }

  private notify(repos: UnitOfWorkRepositories, investorId: string, notice: Notice) {
    return notifyInvestor(repos, investorId, notice);
  }
}
