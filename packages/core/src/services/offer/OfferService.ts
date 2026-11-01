// The offer rules (T296, T307; FR-042, FR-043, XII): a matched investor makes one offer per package
// and round and can revise it until the deadline; each revise restates every term, names the
// version it read, and is kept as a revision with its own expiry job. The investor can withdraw an
// offer until it is accepted, even after the deadline. A refusal says why (the deadline passed, the
// package was withdrawn, an offer already exists). The investor answers an agent's counter by
// taking its terms or keeping their own (T310), and can push out a backup offer's expiry, even after
// the deadline, but change nothing else. Only the package's agent lists its offers. Every change is
// audited.
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@clever/contracts/common";
import type { ListingPackage } from "@clever/contracts/listing-package";
import {
  counterResponseSchema,
  createOfferInputSchema,
  reviseOfferInputSchema,
  withdrawOfferInputSchema,
  type Offer,
  type OfferTerms,
} from "@clever/contracts/offer";
import type { IClock } from "../../providers/clock/IClock.js";
import {
  LIVE_OFFER_STATUSES,
  OPEN_OFFER_STATUSES,
} from "../../repositories/offer/IOfferRepository.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import type { AuditAction } from "@clever/contracts/audit";
import { placeOf } from "../../workflows/notice-text.js";
import { scheduleOfferExpiry } from "../../workflows/offer-round/schedule.js";
import { checkOfferDates, termsOf } from "./offer-terms.js";
import { investorOf } from "../investor-package/InvestorPackageQueryService.js";

export interface IOfferService {
  create(actor: Actor, packageId: string, input: unknown): Promise<Offer>;
  revise(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  withdraw(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  respondToCounter(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  listForPackage(actor: Actor, packageId: string): Promise<Offer[]>;
}

const NOT_FOUND = "Package not found";

export class OfferService implements IOfferService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async create(actor: Actor, packageId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor);
    const terms = checkOfferDates(createOfferInputSchema.parse(input), this.deps.clock.now());
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(packageId);
      const match = pkg && (await repos.matches.findOne(packageId, investorId, pkg.round));
      if (!pkg || !match) throw new NotFoundError(NOT_FOUND);
      this.assertOpen(pkg);
      const existing = await repos.offers.findLatest(packageId, investorId, pkg.round);
      if (existing && LIVE_OFFER_STATUSES.includes(existing.status)) {
        throw new BusinessRuleError(
          "You already have an offer on this package; revise it instead",
          "OFFER_EXISTS",
          { offerId: existing.id },
        );
      }
      const offer = await repos.offers.create({
        packageId,
        investorId,
        round: pkg.round,
        ...terms,
      });
      await scheduleOfferExpiry(repos, offer);
      await audit(repos, actor, offer, "OFFER_SUBMITTED");
      return offer;
    });
  }

  async revise(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor);
    const { version, ...rest } = reviseOfferInputSchema.parse(input);
    const now = this.deps.clock.now();
    return this.uow.run(async (repos) => {
      const current = await repos.offers.findById(offerId);
      if (!current || current.investorId !== investorId) throw new NotFoundError("Offer not found");
      if (current.status === "BACKUP")
        return this.extendBackup(repos, actor, current, version, rest);
      if (current.status !== "ACTIVE" && current.status !== "COUNTERED") {
        throw new BusinessRuleError("This offer can no longer be revised", "OFFER_NOT_OPEN");
      }
      const terms = checkOfferDates(rest, now);
      const pkg = await repos.packages.findById(current.packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      this.assertOpen(pkg);
      // A revision of a countered offer replaces the counter (FR-052).
      const offer = await repos.offers.revise(offerId, version, terms, { status: "ACTIVE" });
      await scheduleOfferExpiry(repos, offer);
      await audit(repos, actor, offer, "OFFER_REVISED");
      return offer;
    });
  }

  async withdraw(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor);
    const { version } = withdrawOfferInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await repos.offers.findById(offerId);
      if (!current || current.investorId !== investorId) throw new NotFoundError("Offer not found");
      // Until it is accepted, an offer can be taken back, deadline or not (FR-043, FR-054).
      if (!OPEN_OFFER_STATUSES.includes(current.status)) {
        throw new BusinessRuleError("This offer can no longer be withdrawn", "OFFER_NOT_OPEN");
      }
      const offer = await repos.offers.updateStatus(offerId, version, "WITHDRAWN");
      await audit(repos, actor, offer, "OFFER_WITHDRAWN");
      return offer;
    });
  }

  async respondToCounter(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor);
    const { action, version } = counterResponseSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await repos.offers.findById(offerId);
      if (!current || current.investorId !== investorId) throw new NotFoundError("Offer not found");
      if (current.status !== "COUNTERED") {
        throw new BusinessRuleError("There is no counter-offer to answer", "NOT_COUNTERED");
      }
      const pkg = await repos.packages.findById(current.packageId);
      if (pkg?.status !== "ACCEPTING_OFFERS") {
        throw new BusinessRuleError(
          "This package is no longer accepting offers",
          "PACKAGE_NOT_ACCEPTING_OFFERS",
        );
      }
      // Accepting takes the counter's terms; declining goes back to the investor's own last terms.
      const terms =
        action === "ACCEPT"
          ? termsOf(current)
          : await repos.offers.findLastTerms(offerId, "INVESTOR");
      const offer = await repos.offers.revise(offerId, version, terms!, { status: "ACTIVE" });
      await scheduleOfferExpiry(repos, offer);
      await audit(
        repos,
        actor,
        offer,
        action === "ACCEPT" ? "COUNTER_ACCEPTED" : "COUNTER_DECLINED",
      );
      const agentUserId = await repos.users.findIdByAgentId(pkg.agentId);
      if (agentUserId) {
        const place = placeOf(await repos.properties.findById(pkg.propertyId));
        await repos.notifications.create({
          userId: agentUserId,
          type: "COUNTER_ANSWERED",
          packageId: pkg.id,
          title:
            action === "ACCEPT" ? "A counter-offer was accepted" : "A counter-offer was declined",
          body:
            action === "ACCEPT"
              ? `The investor took your counter on the listing in ${place}; their offer now has those terms.`
              : `The investor declined your counter on the listing in ${place}; their offer is back at their own terms.`,
        });
      }
      return offer;
    });
  }

  /** A backup offer can only last longer: its expiry may move later, and nothing else changes. */
  private async extendBackup(
    repos: UnitOfWorkRepositories,
    actor: Actor,
    current: Offer,
    version: number,
    input: Omit<OfferTerms, "expiresAt"> & { expiresAt: string },
  ): Promise<Offer> {
    const { expiresAt: _expiresAt, ...kept } = termsOf(current);
    const changed = (Object.keys(kept) as (keyof typeof kept)[]).filter(
      (key) => JSON.stringify(kept[key]) !== JSON.stringify(input[key]),
    );
    if (changed.length > 0) {
      throw new ValidationError(
        "Only the expiry of a backup offer can change",
        changed.map((field) => ({ field, message: "Cannot change on a backup offer" })),
      );
    }
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= current.expiresAt || expiresAt <= this.deps.clock.now()) {
      throw new ValidationError("Some fields are invalid", [
        { field: "expiresAt", message: "Must be later than the current expiry" },
      ]);
    }
    const offer = await repos.offers.revise(current.id, version, { ...kept, expiresAt });
    await scheduleOfferExpiry(repos, offer);
    await audit(repos, actor, offer, "BACKUP_EXTENDED");
    return offer;
  }

  async listForPackage(actor: Actor, packageId: string): Promise<Offer[]> {
    if (actor.role !== "AGENT")
      throw new ForbiddenError("Only the package's agent sees its offers");
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findForAgent(actor.agentId, packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      return repos.offers.listByPackage(packageId, pkg.round);
    });
  }

  /** Offers are taken only while the package accepts them and before its deadline. */
  private assertOpen(pkg: ListingPackage) {
    if (pkg.status !== "ACCEPTING_OFFERS") {
      throw new BusinessRuleError(
        "This package is no longer accepting offers",
        "PACKAGE_NOT_ACCEPTING_OFFERS",
      );
    }
    if (pkg.offerDeadline && this.deps.clock.now() >= pkg.offerDeadline) {
      throw new BusinessRuleError("The offer deadline has passed", "OFFER_DEADLINE_PASSED");
    }
  }
}

function audit(
  repos: UnitOfWorkRepositories,
  actor: Actor,
  offer: Offer,
  action: Extract<
    AuditAction,
    | "OFFER_SUBMITTED"
    | "OFFER_REVISED"
    | "OFFER_WITHDRAWN"
    | "COUNTER_ACCEPTED"
    | "COUNTER_DECLINED"
    | "BACKUP_EXTENDED"
  >,
) {
  return repos.audit.append({
    actorType: "USER",
    actorId: actor.userId,
    action,
    entityType: "ListingPackage",
    entityId: offer.packageId,
    outcome: "SUCCESS",
    details: { offerId: offer.id, revision: offer.currentRevision, price: offer.price },
  });
}
