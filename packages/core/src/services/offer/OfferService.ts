// The offer rules (T296, T307; FR-042, FR-043, XII): a matched investor makes one offer per package
// and round and can revise it until the deadline, or answer a counter with a revision even after it
// (T377); each revise restates every term, names the version it read, and is kept as a revision
// with its own expiry job. The investor can withdraw an
// offer until it is accepted, even after the deadline. A refusal says why (the deadline passed, the
// package was withdrawn, an offer already exists). The investor answers an agent's counter by
// taking its terms or keeping their own (T310), and can push out a backup offer's expiry, even after
// the deadline, but change nothing else. A revision or an answer to a counter waits for the package's
// lock and reads the offer after it, so an accept turning the other offers into backups happens wholly
// before or after it (T390). Only the package's agent and operations (read-only, FR-080) list its
// offers. Every change is audited.
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
import { releasePromotedBackup } from "../../workflows/deal-lifecycle/release-promoted-backup.js";
import { scheduleOfferExpiry } from "../../workflows/offer-round/schedule.js";
import { checkOfferDates, termsOf } from "./offer-terms.js";
import { investorOf } from "../actor-guards.js";
import { required } from "../../errors/required.js";
import { crmSnapshot } from "../../outbox/crm-snapshot.js";
import { writeEvent } from "../../outbox/write-event.js";

export interface IOfferService {
  create(actor: Actor, packageId: string, input: unknown): Promise<Offer>;
  revise(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  withdraw(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  respondToCounter(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  /** A package's offers for its agent or operations (T386), each with whether operations
   * deactivated its investor (T370). */
  listForPackage(
    actor: Actor,
    packageId: string,
  ): Promise<{ offer: Offer; investorActive: boolean }[]>;
}

const NOT_FOUND = "Package not found";
const INVESTORS_ONLY = "Only investors see matched packages";

export class OfferService implements IOfferService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async create(actor: Actor, packageId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const terms = checkOfferDates(createOfferInputSchema.parse(input), this.deps.clock.now());
    return this.uow.run(async (repos) => {
      // Offers on one package are made one at a time, so each CRM offer count includes the others.
      await repos.packages.lock(packageId);
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
      // The CRM's offer count changes with the offer, in the same change (FR-077).
      await writeEvent(repos, {
        type: "offer.submitted",
        payload: { packageId, offerId: offer.id, investorId, crm: await crmSnapshot(repos, pkg) },
      });
      return offer;
    });
  }

  async revise(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const { version, ...rest } = reviseOfferInputSchema.parse(input);
    const now = this.deps.clock.now();
    return this.uow.run(async (repos) => {
      const current = await this.lockedOffer(repos, offerId, investorId);
      if (current.status === "BACKUP")
        return this.extendBackup(repos, actor, current, version, rest);
      if (current.status !== "ACTIVE" && current.status !== "COUNTERED") {
        throw new BusinessRuleError("This offer can no longer be revised", "OFFER_NOT_OPEN");
      }
      const terms = checkOfferDates(rest, now);
      const pkg = await repos.packages.findById(current.packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      // A revision of a countered offer replaces the counter (FR-052). The agent may counter after
      // the deadline, so the investor may answer then too; any other revision is refused (FR-044).
      this.assertOpen(pkg, current.status === "COUNTERED");
      const offer = await repos.offers.revise(offerId, version, terms, { status: "ACTIVE" });
      await scheduleOfferExpiry(repos, offer);
      await audit(repos, actor, offer, "OFFER_REVISED");
      return offer;
    });
  }

  async withdraw(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const { version } = withdrawOfferInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await repos.offers.findById(offerId);
      if (!current || current.investorId !== investorId) throw new NotFoundError("Offer not found");
      // Until it is accepted, an offer can be taken back, deadline or not (FR-043, FR-054).
      if (!OPEN_OFFER_STATUSES.includes(current.status)) {
        throw new BusinessRuleError("This offer can no longer be withdrawn", "OFFER_NOT_OPEN");
      }
      await repos.packages.lock(current.packageId);
      const offer = await repos.offers.updateStatus(offerId, version, "WITHDRAWN");
      await audit(repos, actor, offer, "OFFER_WITHDRAWN");
      // A promoted backup that withdraws stops waiting to reconfirm (T365).
      await releasePromotedBackup(repos, offer, "WITHDRAWN", actor);
      // The CRM's offer count goes back down in the same change (FR-077).
      const pkg = await repos.packages.findById(offer.packageId);
      if (pkg) {
        await writeEvent(repos, {
          type: "offer.withdrawn",
          payload: {
            packageId: pkg.id,
            offerId,
            investorId,
            crm: await crmSnapshot(repos, pkg),
          },
        });
      }
      return offer;
    });
  }

  async respondToCounter(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const { action, version } = counterResponseSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await this.lockedOffer(repos, offerId, investorId);
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
          : required(
              await repos.offers.findLastTerms(offerId, "INVESTOR"),
              `The investor's own terms on offer ${offerId}`,
            );
      // Terms that have already expired cannot come back to life; a revision sets new ones.
      if (terms.expiresAt <= this.deps.clock.now()) {
        throw new BusinessRuleError(
          "Those terms have expired; revise your offer with a new expiry instead",
          "TERMS_EXPIRED",
        );
      }
      const offer = await repos.offers.revise(offerId, version, terms, { status: "ACTIVE" });
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

  /** The investor's offer, read again once its package's lock is held, as the decisions take it. */
  private async lockedOffer(
    repos: UnitOfWorkRepositories,
    offerId: string,
    investorId: string,
  ): Promise<Offer> {
    const found = await repos.offers.findById(offerId);
    if (!found || found.investorId !== investorId) throw new NotFoundError("Offer not found");
    await repos.packages.lock(found.packageId);
    // Offers are never deleted, so it is still there.
    return required(await repos.offers.findById(offerId), `Offer ${offerId}`);
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
      throw new ValidationError("Some fields need fixing. See the messages below.", [
        { field: "expiresAt", message: "Must be later than the current expiry" },
      ]);
    }
    const offer = await repos.offers.revise(current.id, version, { ...kept, expiresAt });
    await scheduleOfferExpiry(repos, offer);
    await audit(repos, actor, offer, "BACKUP_EXTENDED");
    return offer;
  }

  async listForPackage(
    actor: Actor,
    packageId: string,
  ): Promise<{ offer: Offer; investorActive: boolean }[]> {
    if (actor.role === "INVESTOR") {
      throw new ForbiddenError("Only the package's agent and operations see its offers");
    }
    return this.uow.run(async (repos) => {
      // Operations see every package's offers, read-only (FR-080).
      const pkg =
        actor.role === "OPS"
          ? await repos.packages.findById(packageId)
          : await repos.packages.findForAgent(actor.agentId, packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      const offers = await repos.offers.listByPackage(packageId, pkg.round);
      const inactive = await repos.investors.findInactive(offers.map((o) => o.investorId));
      return offers.map((offer) => ({ offer, investorActive: !inactive.has(offer.investorId) }));
    });
  }

  /** Offers are taken only while the package accepts them and before its deadline, except an
   * investor's answer to a counter, which the deadline does not stop. */
  private assertOpen(pkg: ListingPackage, answeringCounter = false) {
    if (pkg.status !== "ACCEPTING_OFFERS") {
      throw new BusinessRuleError(
        "This package is no longer accepting offers",
        "PACKAGE_NOT_ACCEPTING_OFFERS",
      );
    }
    if (!answeringCounter && pkg.offerDeadline && this.deps.clock.now() >= pkg.offerDeadline) {
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
