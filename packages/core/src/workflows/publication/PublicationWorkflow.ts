// Publishing, withdrawing, and re-running a listing package's offer round (T291, T307; FR-012 to
// FR-014, FR-022, FR-058). Publish checks every field matching and investors need and names each
// one that is missing, then opens offers, snapshots listing version 1, and queues matching and the
// deadline, all in one change. Withdraw closes the package, declines its open offers, tells each
// matched investor, and frees the address. Reopen starts a new round that is matched again, and
// declines and tells each offer the old round left open, such as a backup after a fall-through
// (T377); extending moves the deadline of the current round, and matches an edit made while no
// offers were open as the next listing version (T375).
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "@clever/contracts/common";
import {
  offerDeadlineInputSchema,
  publishInputSchema,
  withdrawInputSchema,
  type ListingPackage,
  type PackageStatus,
} from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { IClock } from "../../providers/clock/IClock.js";
import {
  loadAgentPackage,
  type AgentPackage,
} from "../../services/listing-package/ListingPackageService.js";
import { earliestToday } from "../../providers/clock/earliest-today.js";
import { agentOf } from "../../services/actor-guards.js";
import { missingToPublish } from "../../services/listing-package/publish-rules.js";
import { isMaterialChange, toListingFacts } from "../../registry/listing-facts.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { snapshotAndQueueMatching } from "../matching/queue-matching.js";
import { placeOf } from "../notice-text.js";
import { scheduleRoundClose } from "../offer-round/schedule.js";
import { notifyInvestor } from "../../outbox/notify-investor.js";

export interface IPublicationWorkflow {
  publish(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
  withdraw(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
  reopen(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
  extendDeadline(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage>;
}

/** Where a withdraw, a reopen, and an extension may start from (data-model.md, PackageStatus). */
const WITHDRAWABLE: PackageStatus[] = [
  "DRAFT",
  "ACCEPTING_OFFERS",
  "NO_OFFERS_RECEIVED",
  "FELL_THROUGH",
];
const REOPENABLE: PackageStatus[] = ["NO_OFFERS_RECEIVED", "FELL_THROUGH"];
const EXTENDABLE: PackageStatus[] = ["ACCEPTING_OFFERS", "NO_OFFERS_RECEIVED"];

const HOUR = 3_600_000;
const DEFAULT_OFFER_WINDOW_HOURS = 72;
const MAX_OFFER_WINDOW_DAYS = 30;
const NOT_FOUND = "Package not found";
const AGENTS_ONLY = "Only agents publish listing packages";

export class PublicationWorkflow implements IPublicationWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async publish(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = publishInputSchema.parse(input);
    const now = this.deps.clock.now();
    const offerDeadline = data.offerDeadline
      ? new Date(data.offerDeadline)
      : new Date(now.getTime() + DEFAULT_OFFER_WINDOW_HOURS * HOUR);

    return this.uow.run(async (repos) => {
      // A photo removal waits here, so the photos read below are the ones published.
      await repos.packages.lock(packageId);
      const current = await this.ownPackage(repos, agentId, packageId);
      if (current.status !== "DRAFT") {
        throw new BusinessRuleError("This listing is already published", "NOT_A_DRAFT");
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
      await snapshotAndQueueMatching(repos, pkg, property, "PUBLISH");
      await scheduleRoundClose(repos, pkg);
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
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = withdrawInputSchema.parse(input);

    return this.uow.run(async (repos) => {
      const current = await this.ownPackage(repos, agentId, packageId);
      if (!WITHDRAWABLE.includes(current.status)) {
        throw new BusinessRuleError(
          "This listing can't be withdrawn once an offer is accepted, or after it has been withdrawn",
          "NOT_WITHDRAWABLE",
        );
      }
      await assertNoBackupDeciding(repos, packageId);
      const pkg = await repos.packages.update(packageId, data.version, { status: "WITHDRAWN" });
      const declined = await repos.offers.declineOpen(packageId, pkg.round);
      const property = await repos.properties.findById(pkg.propertyId);
      for (const match of await repos.matches.listByPackage(packageId, pkg.round)) {
        await notifyInvestor(repos, match.investorId, {
          type: "PACKAGE_WITHDRAWN",
          packageId,
          title: "A matched listing was withdrawn",
          body: `The listing in ${placeOf(property)} is no longer accepting offers.`,
        });
      }
      await repos.audit.append({
        ...auditEntry(actor, packageId, "PACKAGE_WITHDRAWN"),
        details: { round: pkg.round, declinedOffers: declined.length },
      });
      return loadAgentPackage(repos, pkg);
    });
  }

  async reopen(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = offerDeadlineInputSchema.parse(input);
    const offerDeadline = this.checkDeadline(data.offerDeadline);

    return this.uow.run(async (repos) => {
      const current = await this.ownPackage(repos, agentId, packageId);
      if (!REOPENABLE.includes(current.status)) {
        throw new BusinessRuleError(
          "Only a listing with no offers, or whose deal fell through, can be reopened",
          "NOT_REOPENABLE",
        );
      }
      await assertNoBackupDeciding(repos, packageId);
      const pkg = await repos.packages.update(packageId, data.version, {
        status: "ACCEPTING_OFFERS",
        round: current.round + 1,
        listingVersion: current.listingVersion + 1,
        offerDeadline,
      });
      // Whatever the old round left open is declined, and its investor told: the new round starts
      // clean. After a fall-through these are the backups the agent chose not to promote (T377).
      const declined = await repos.offers.declineOpen(packageId, current.round);
      const property = await repos.properties.findById(pkg.propertyId);
      if (!property) throw new NotFoundError(NOT_FOUND);
      for (const offer of declined) {
        await notifyInvestor(repos, offer.investorId, {
          type: "OFFER_DECLINED",
          packageId,
          title: "Your offer was declined",
          body: `The listing in ${placeOf(property)} opened a new offer round, so your earlier offer was closed.`,
        });
      }
      // Matching runs again for the new round, so every matched investor is told again (FR-058).
      await snapshotAndQueueMatching(repos, pkg, property, "REOPEN");
      await scheduleRoundClose(repos, pkg);
      await repos.audit.append({
        ...auditEntry(actor, packageId, "PACKAGE_REOPENED"),
        details: {
          round: pkg.round,
          offerDeadline: offerDeadline.toISOString(),
          declinedOffers: declined.length,
        },
      });
      return loadAgentPackage(repos, pkg);
    });
  }

  async extendDeadline(actor: Actor, packageId: string, input: unknown): Promise<AgentPackage> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = offerDeadlineInputSchema.parse(input);
    const offerDeadline = this.checkDeadline(data.offerDeadline);

    return this.uow.run(async (repos) => {
      const current = await this.ownPackage(repos, agentId, packageId);
      if (!EXTENDABLE.includes(current.status)) {
        throw new BusinessRuleError(
          "The offer deadline can be extended only while the listing is published and no offer is accepted",
          "NOT_EXTENDABLE",
        );
      }
      if (current.offerDeadline && offerDeadline <= current.offerDeadline) {
        throw new ValidationError("Some fields need fixing. See the messages below.", [
          { field: "offerDeadline", message: "Must be later than the current deadline" },
        ]);
      }
      const property = await repos.properties.findById(current.propertyId);
      if (!property) throw new NotFoundError(NOT_FOUND);
      // Matching runs only while offers are open, so an edit made with none open was not matched:
      // it is matched now, as the next listing version (FR-020).
      const last = await repos.listingVersions.find(packageId, current.listingVersion);
      if (!last)
        throw new Error(`Listing version ${current.listingVersion} of ${packageId} is missing`);
      const edited = isMaterialChange(last.snapshot, toListingFacts(current, property));
      const pkg = await repos.packages.update(packageId, data.version, {
        status: "ACCEPTING_OFFERS",
        offerDeadline,
        listingVersion: edited ? current.listingVersion + 1 : undefined,
      });
      if (edited) await snapshotAndQueueMatching(repos, pkg, property, "PACKAGE_EDIT");
      // The old deadline's job finds the deadline changed and does nothing.
      await scheduleRoundClose(repos, pkg);
      for (const match of await repos.matches.listByPackage(packageId, pkg.round)) {
        await notifyInvestor(repos, match.investorId, {
          type: "OFFER_DEADLINE_EXTENDED",
          packageId,
          title: "A matched listing has a later deadline",
          body: `Offers on the listing in ${placeOf(property)} are now due by ${utc(offerDeadline)}.`,
        });
      }
      await repos.audit.append({
        ...auditEntry(actor, packageId, "OFFER_DEADLINE_EXTENDED"),
        details: {
          round: pkg.round,
          offerDeadline: offerDeadline.toISOString(),
          ...(edited && { listingVersion: pkg.listingVersion }),
        },
      });
      return loadAgentPackage(repos, pkg);
    });
  }

  /** A new deadline is in the future and within the longest offer window. */
  private checkDeadline(value: string): Date {
    const deadline = new Date(value);
    const now = this.deps.clock.now();
    const message =
      deadline <= now
        ? "Must be in the future"
        : deadline.getTime() > now.getTime() + MAX_OFFER_WINDOW_DAYS * 24 * HOUR
          ? `Must be within ${MAX_OFFER_WINDOW_DAYS} days`
          : null;
    if (message) {
      throw new ValidationError("Some fields need fixing. See the messages below.", [
        { field: "offerDeadline", message },
      ]);
    }
    return deadline;
  }

  private async ownPackage(repos: UnitOfWorkRepositories, agentId: string, id: string) {
    const pkg = await repos.packages.findForAgent(agentId, id);
    if (!pkg) throw new NotFoundError(NOT_FOUND);
    return pkg;
  }
}

/** After a fall-through, a promoted backup's answer comes first (FR-057). */
async function assertNoBackupDeciding(repos: UnitOfWorkRepositories, packageId: string) {
  if (await repos.deals.findActiveByPackage(packageId)) {
    throw new BusinessRuleError(
      "The backup buyer hasn't confirmed yet. Wait for their answer.",
      "BACKUP_PENDING",
    );
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
  const errors = missingToPublish(pkg, property, photos.length);
  const need = (field: string, message: string) => errors.push({ field, message });
  // The agent's own today counts, wherever they are (T387).
  const today = earliestToday(now);

  if (offerDeadline <= now) need("offerDeadline", "Must be in the future");
  else if (offerDeadline.getTime() > now.getTime() + MAX_OFFER_WINDOW_DAYS * 24 * HOUR) {
    need("offerDeadline", `Must be within ${MAX_OFFER_WINDOW_DAYS} days`);
  }
  if (pkg.closingWindowStart !== null && pkg.closingWindowStart < today) {
    need("closingWindowStart", "Cannot be in the past");
  }
  return errors;
}

const utc = (at: Date) => `${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;

const auditEntry = (
  actor: Actor,
  packageId: string,
  action:
    "PACKAGE_PUBLISHED" | "PACKAGE_WITHDRAWN" | "PACKAGE_REOPENED" | "OFFER_DEADLINE_EXTENDED",
) => ({
  actorType: "USER" as const,
  actorId: actor.userId,
  action,
  entityType: "ListingPackage",
  entityId: packageId,
  outcome: "SUCCESS" as const,
});
