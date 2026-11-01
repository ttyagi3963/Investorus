// Publishing and withdrawing a listing package (T291; FR-012, FR-013, FR-022). Publish checks
// every field matching and investors need and names each one that is missing, then opens offers,
// snapshots listing version 1, and queues matching, all in one change. Withdraw closes the
// package, declines its open offers, tells each matched investor, and frees the address.
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "@clever/contracts/common";
import {
  publishInputSchema,
  withdrawInputSchema,
  type ListingPackage,
} from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { IClock } from "../../providers/clock/IClock.js";
import {
  loadAgentPackage,
  type AgentPackage,
} from "../../services/listing-package/ListingPackageService.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { snapshotAndQueueMatching } from "../matching/queue-matching.js";

export interface IPublicationWorkflow {
  publish(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
  withdraw(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
}

const HOUR = 3_600_000;
const DEFAULT_OFFER_WINDOW_HOURS = 72;
const MAX_OFFER_WINDOW_DAYS = 30;
const NOT_FOUND = "Package not found";

/** The property facts each type must have before investors see it. */
const REQUIRED_FACTS: Record<Property["propertyType"], (keyof Property)[]> = {
  LAND: ["lotSqft"],
  MULTI_FAMILY: ["units"],
  SINGLE_FAMILY: ["beds", "baths", "sqft", "yearBuilt", "condition"],
  CONDO: ["beds", "baths", "sqft", "yearBuilt", "condition"],
  TOWNHOME: ["beds", "baths", "sqft", "yearBuilt", "condition"],
  MANUFACTURED: ["beds", "baths", "sqft", "yearBuilt", "condition"],
};

export class PublicationWorkflow implements IPublicationWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async publish(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage> {
    const agentId = this.agentOf(actor);
    const data = publishInputSchema.parse(input);
    const now = this.deps.clock.now();
    const offerDeadline = data.offerDeadline
      ? new Date(data.offerDeadline)
      : new Date(now.getTime() + DEFAULT_OFFER_WINDOW_HOURS * HOUR);

    return this.uow.run(async (repos) => {
      const current = await this.ownPackage(repos, agentId, packageId);
      if (current.status !== "DRAFT") {
        throw new BusinessRuleError("Only a draft can be published", "NOT_A_DRAFT");
      }
      const { property, photos } = await loadAgentPackage(repos, current);
      const errors = publishBlockers(current, property, photos, offerDeadline, now);
      if (errors.length > 0) throw new ValidationError("Some fields block publishing", errors);

      const pkg = await repos.packages.update(packageId, data.version, {
        status: "ACCEPTING_OFFERS",
        publishedAt: now,
        offerDeadline,
        listingVersion: 1,
      });
      await snapshotAndQueueMatching(repos, pkg, property);
      await repos.audit.append({
        ...auditEntry(actor, packageId, "PACKAGE_PUBLISHED"),
        details: {
          listingVersion: 1,
          round: pkg.round,
          offerDeadline: offerDeadline.toISOString(),
        },
      });
      return loadAgentPackage(repos, pkg);
    });
  }

  async withdraw(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage> {
    const agentId = this.agentOf(actor);
    const data = withdrawInputSchema.parse(input);

    return this.uow.run(async (repos) => {
      const current = await this.ownPackage(repos, agentId, packageId);
      if (current.status !== "DRAFT" && current.status !== "ACCEPTING_OFFERS") {
        throw new BusinessRuleError("This package cannot be withdrawn", "NOT_WITHDRAWABLE");
      }
      const pkg = await repos.packages.update(packageId, data.version, { status: "WITHDRAWN" });
      const declined = await repos.offers.declineOpen(packageId, pkg.round);
      const property = await repos.properties.findById(pkg.propertyId);
      for (const match of await repos.matches.listByPackage(packageId, pkg.round)) {
        const userId = await repos.users.findIdByInvestorId(match.investorId);
        if (!userId) continue;
        await repos.notifications.create({
          userId,
          type: "PACKAGE_WITHDRAWN",
          packageId,
          title: "A matched listing was withdrawn",
          body: `The listing in ${placeOf(property)} is no longer accepting offers.`,
        });
      }
      await repos.audit.append({
        ...auditEntry(actor, packageId, "PACKAGE_WITHDRAWN"),
        details: { round: pkg.round, declinedOffers: declined },
      });
      return loadAgentPackage(repos, pkg);
    });
  }

  private agentOf(actor: Actor): string {
    if (actor.role !== "AGENT") throw new ForbiddenError("Only agents publish listing packages");
    return actor.agentId;
  }

  private async ownPackage(repos: UnitOfWorkRepositories, agentId: string, id: string) {
    const pkg = await repos.packages.findForAgent(agentId, id);
    if (!pkg) throw new NotFoundError(NOT_FOUND);
    return pkg;
  }
}

/** Every field that blocks a publish, each named so the form can link to it. */
function publishBlockers(
  pkg: ListingPackage,
  property: Property,
  photos: Photo[],
  offerDeadline: Date,
  now: Date,
): FieldError[] {
  const errors: FieldError[] = [];
  const need = (field: string, message: string) => errors.push({ field, message });
  const today = now.toISOString().slice(0, 10);

  if (photos.length === 0) need("photos", "Add at least one photo");
  if (offerDeadline <= now) need("offerDeadline", "Must be in the future");
  else if (offerDeadline.getTime() > now.getTime() + MAX_OFFER_WINDOW_DAYS * 24 * HOUR) {
    need("offerDeadline", `Must be within ${MAX_OFFER_WINDOW_DAYS} days`);
  }
  if (pkg.closingWindowStart === null) need("closingWindowStart", "Enter the closing window");
  else if (pkg.closingWindowStart < today) need("closingWindowStart", "Cannot be in the past");
  if (pkg.closingWindowEnd === null) need("closingWindowEnd", "Enter the closing window");
  if (pkg.currentlyListed === null) need("currentlyListed", "Say whether the home is listed");
  if (pkg.eligiblePrograms.length === 0) need("eligiblePrograms", "Choose at least one program");
  for (const fact of REQUIRED_FACTS[property.propertyType]) {
    if (property[fact] === null) need(`property.${fact}`, "Required to publish this type of home");
  }
  return errors;
}

/** City, state, and ZIP: never the street (no seller detail in a notification). */
export const placeOf = (property: Property | null) =>
  property ? `${property.city}, ${property.state} ${property.zip}` : "your area";

const auditEntry = (
  actor: Actor,
  packageId: string,
  action: "PACKAGE_PUBLISHED" | "PACKAGE_WITHDRAWN",
) => ({
  actorType: "USER" as const,
  actorId: actor.userId,
  action,
  entityType: "ListingPackage",
  entityId: packageId,
  outcome: "SUCCESS" as const,
});
