// The offer rules (T296; FR-042, XII): a matched investor makes one offer per package and round
// and can revise it until the deadline; each revise restates every term, names the version it
// read, and is kept as a revision. A refusal says why (the deadline passed, the package was
// withdrawn, an offer already exists). Only the package's agent lists its offers. Every submit and
// revise is audited.
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "@clever/contracts/common";
import type { ListingPackage } from "@clever/contracts/listing-package";
import {
  createOfferInputSchema,
  reviseOfferInputSchema,
  type Offer,
  type OfferTerms,
} from "@clever/contracts/offer";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { investorOf } from "../investor-package/InvestorPackageQueryService.js";

export interface IOfferService {
  create(actor: Actor, packageId: string, input: unknown): Promise<Offer>;
  revise(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
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
    const terms = this.checkTerms(createOfferInputSchema.parse(input));
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(packageId);
      const match = pkg && (await repos.matches.findOne(packageId, investorId, pkg.round));
      if (!pkg || !match) throw new NotFoundError(NOT_FOUND);
      this.assertOpen(pkg);
      const existing = await repos.offers.findLatest(packageId, investorId, pkg.round);
      if (existing?.status === "ACTIVE") {
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
      await audit(repos, actor, offer, "OFFER_SUBMITTED");
      return offer;
    });
  }

  async revise(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor);
    const { version, ...rest } = reviseOfferInputSchema.parse(input);
    const terms = this.checkTerms(rest);
    return this.uow.run(async (repos) => {
      const current = await repos.offers.findById(offerId);
      if (!current || current.investorId !== investorId) throw new NotFoundError("Offer not found");
      if (current.status !== "ACTIVE") {
        throw new BusinessRuleError("This offer was declined", "OFFER_NOT_ACTIVE");
      }
      const pkg = await repos.packages.findById(current.packageId);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      this.assertOpen(pkg);
      const offer = await repos.offers.revise(offerId, version, terms);
      await audit(repos, actor, offer, "OFFER_REVISED");
      return offer;
    });
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

  /** The date rules Zod cannot check without the clock. */
  private checkTerms(input: Omit<OfferTerms, "expiresAt"> & { expiresAt: string }): OfferTerms {
    const now = this.deps.clock.now();
    const errors: FieldError[] = [];
    if (input.closingDate < now.toISOString().slice(0, 10)) {
      errors.push({ field: "closingDate", message: "Cannot be in the past" });
    }
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now) errors.push({ field: "expiresAt", message: "Must be in the future" });
    if (errors.length > 0) throw new ValidationError("Some fields are invalid", errors);
    return { ...input, expiresAt };
  }
}

function audit(
  repos: UnitOfWorkRepositories,
  actor: Actor,
  offer: Offer,
  action: "OFFER_SUBMITTED" | "OFFER_REVISED",
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
