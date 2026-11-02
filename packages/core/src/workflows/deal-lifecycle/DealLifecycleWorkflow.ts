// The accepted deal, tracked to closing (T311; FR-055 to FR-057, FR-059). The agent records each
// milestone only in order, and the package mirrors the deal; closing declines the backups. A deal
// that falls through (with a reason, kept encrypted and agent-only) closes the winning offer, and
// the agent can promote an unexpired backup, who must reconfirm within the configured hours: yes
// makes it the accepted offer, and no or the timeout (a durable job) frees the agent to promote
// another. Every step is audited and its investor or agent is told, in the same change.
import type { Actor } from "@clever/contracts/auth";
import { BusinessRuleError, ConflictError, NotFoundError } from "@clever/contracts/common";
import {
  fallThroughInputSchema,
  milestoneInputSchema,
  promoteBackupSchema,
  reconfirmationSchema,
  type Deal,
  type DealMilestone,
  type DealParts,
  type DealStatus,
} from "@clever/contracts/deal";
import type { ExpireReconfirmationPayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Offer } from "@clever/contracts/offer";
import type { IClock } from "../../providers/clock/IClock.js";
import { required } from "../../errors/required.js";
import { readConfig } from "../../repositories/config/read-config.js";
import type { NewNotification } from "../../repositories/notification/INotificationRepository.js";
import { agentOf, investorOf } from "../../services/actor-guards.js";
import { computeNetProceeds } from "../../services/offer-comparison/net-proceeds.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";
import { notifyInvestor, type InvestorNotice } from "../../outbox/notify-investor.js";

export interface IDealLifecycleWorkflow {
  get(actor: Actor, packageId: string): Promise<DealParts>;
  recordMilestone(actor: Actor, dealId: string, input: unknown): Promise<DealParts>;
  fallThrough(actor: Actor, dealId: string, input: unknown): Promise<DealParts>;
  promoteBackup(actor: Actor, packageId: string, input: unknown): Promise<DealParts>;
  reconfirm(actor: Actor, offerId: string, input: unknown): Promise<Offer>;
  expireReconfirmation(payload: ExpireReconfirmationPayload): Promise<void>;
}

/** The one milestone each status may move to (data-model.md, DealStatus). */
const NEXT: Partial<Record<DealStatus, DealMilestone>> = {
  OFFER_ACCEPTED: "UNDER_CONTRACT",
  UNDER_CONTRACT: "INSPECTION",
  INSPECTION: "CLOSING",
  CLOSING: "CLOSED",
};
const allowedNext = (status: DealStatus): DealMilestone[] => (NEXT[status] ? [NEXT[status]] : []);

const NOT_FOUND = "Deal not found";
const AGENT_ONLY = "Only the package's agent manages its deal";
const HOUR = 3_600_000;

type Notice = Omit<NewNotification, "userId">;

export class DealLifecycleWorkflow implements IDealLifecycleWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async get(actor: Actor, packageId: string): Promise<DealParts> {
    const agentId = agentOf(actor, AGENT_ONLY);
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findForAgent(agentId, packageId);
      const deal = pkg && (await repos.deals.findLatestByPackage(packageId));
      if (!pkg || !deal) throw new NotFoundError(NOT_FOUND);
      return this.parts(repos, pkg, deal);
    });
  }

  async recordMilestone(actor: Actor, dealId: string, input: unknown): Promise<DealParts> {
    const agentId = agentOf(actor, AGENT_ONLY);
    const { milestone, version } = milestoneInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const { deal, pkg } = await this.ownDeal(repos, agentId, dealId);
      // Only the next milestone is allowed; CLOSED and the other final statuses allow none.
      if (NEXT[deal.status] !== milestone) {
        throw new ConflictError(
          `A deal at ${deal.status.toLowerCase().replaceAll("_", " ")} cannot move to ${milestone.toLowerCase().replaceAll("_", " ")}`,
          { allowedNext: allowedNext(deal.status) },
        );
      }
      const moved = await repos.deals.update(dealId, version, { status: milestone });
      const updated = await repos.packages.update(pkg.id, pkg.version, { status: milestone });
      const place = await this.place(repos, pkg);
      if (milestone === "CLOSED") {
        // The home is sold: the backups are no longer needed (data-model.md, OfferStatus).
        for (const backup of await repos.offers.declineOpen(pkg.id, pkg.round)) {
          await this.notifyInvestor(repos, backup.investorId, {
            type: "OFFER_DECLINED",
            packageId: pkg.id,
            title: "A listing you backed up has closed",
            body: `The listing in ${place} closed with another buyer, so your backup offer was declined.`,
          });
        }
      }
      const offer = required(await repos.offers.findById(deal.offerId), `Offer ${deal.offerId}`);
      await this.notifyInvestor(repos, offer.investorId, {
        type: "DEAL_MILESTONE",
        packageId: pkg.id,
        title: "Your deal moved forward",
        body: `The deal for the listing in ${place} is now at: ${milestone.toLowerCase().replaceAll("_", " ")}.`,
      });
      await this.audit(repos, actor, pkg.id, "DEAL_MILESTONE", { dealId, milestone });
      return this.parts(repos, updated, moved);
    });
  }

  async fallThrough(actor: Actor, dealId: string, input: unknown): Promise<DealParts> {
    const agentId = agentOf(actor, AGENT_ONLY);
    const { reason, version } = fallThroughInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const { deal, pkg } = await this.ownDeal(repos, agentId, dealId);
      if (!NEXT[deal.status]) {
        throw new BusinessRuleError(
          "Only a deal on its way to closing can fall through",
          "NOT_OPEN_DEAL",
        );
      }
      const fell = await repos.deals.update(dealId, version, {
        status: "FELL_THROUGH",
        fellThroughReason: reason,
      });
      const offer = required(await repos.offers.findById(deal.offerId), `Offer ${deal.offerId}`);
      await repos.offers.updateStatus(offer.id, offer.version, "FELL_THROUGH");
      const updated = await repos.packages.update(pkg.id, pkg.version, { status: "FELL_THROUGH" });
      // The reason is the agent's words and may name the seller, so the buyer is not shown it.
      await this.notifyInvestor(repos, offer.investorId, {
        type: "DEAL_FELL_THROUGH",
        packageId: pkg.id,
        title: "Your deal fell through",
        body: `The deal for the listing in ${await this.place(repos, pkg)} fell through. The agent will contact you if anything changes.`,
      });
      await this.audit(repos, actor, pkg.id, "DEAL_FELL_THROUGH", { dealId, offerId: offer.id });
      return this.parts(repos, updated, fell);
    });
  }

  async promoteBackup(actor: Actor, packageId: string, input: unknown): Promise<DealParts> {
    const agentId = agentOf(actor, AGENT_ONLY);
    const { offerId, version } = promoteBackupSchema.parse(input);
    const now = this.deps.clock.now();
    return this.uow.run(async (repos) => {
      // Ordered against a withdrawal or expiry of the backup, so the offer read below is the one
      // it left; a withdrawn backup is refused rather than promoted (T376).
      await repos.packages.lock(packageId);
      const pkg = await repos.packages.findForAgent(agentId, packageId);
      if (!pkg) throw new NotFoundError("Package not found");
      if (pkg.status !== "FELL_THROUGH") {
        throw new BusinessRuleError(
          "A backup can be promoted only after the deal falls through",
          "NOT_FELL_THROUGH",
        );
      }
      if (await repos.deals.findActiveByPackage(packageId)) {
        throw new BusinessRuleError(
          "The backup buyer hasn't confirmed yet. Wait for their answer.",
          "BACKUP_PENDING",
        );
      }
      const offer = await repos.offers.findById(offerId);
      if (!offer || offer.packageId !== packageId || offer.round !== pkg.round) {
        throw new NotFoundError("Offer not found");
      }
      if (offer.status !== "BACKUP") {
        throw new BusinessRuleError("Only a backup offer can be promoted", "NOT_A_BACKUP");
      }
      if (offer.expiresAt <= now) {
        throw new BusinessRuleError("This backup offer has expired", "OFFER_EXPIRED");
      }
      // The package's version guards a promotion made from a stale screen.
      const updated = await repos.packages.update(packageId, version, {});
      const hours = await readConfig(repos.config, "reconfirmHours");
      const reconfirmBy = new Date(now.getTime() + hours * HOUR);
      const deal = await repos.deals.create({
        packageId,
        offerId,
        status: "PENDING_RECONFIRMATION",
        promotedFromBackup: true,
        reconfirmBy,
      });
      const payload: ExpireReconfirmationPayload = { dealId: deal.id };
      await repos.jobs.enqueue({
        type: "EXPIRE_RECONFIRMATION",
        dedupeKey: `EXPIRE_RECONFIRMATION:${deal.id}`,
        payload,
        runAt: reconfirmBy,
      });
      await this.notifyInvestor(repos, offer.investorId, {
        type: "BACKUP_PROMOTED",
        packageId,
        title: "Your backup offer was chosen",
        body: `The first deal for the listing in ${await this.place(repos, pkg)} fell through, and the seller would like to go ahead with your offer. Reconfirm within ${hours} hours to keep it.`,
      });
      await this.audit(repos, actor, packageId, "BACKUP_PROMOTED", {
        dealId: deal.id,
        offerId,
        reconfirmBy: reconfirmBy.toISOString(),
      });
      return this.parts(repos, updated, deal);
    });
  }

  async reconfirm(actor: Actor, offerId: string, input: unknown): Promise<Offer> {
    const investorId = investorOf(actor, "Only investors see matched packages");
    const { action } = reconfirmationSchema.parse(input);
    return this.uow.run(async (repos) => {
      const found = await repos.offers.findById(offerId);
      if (!found || found.investorId !== investorId) throw new NotFoundError("Offer not found");
      // Orders this against a withdrawal or expiry of the same offer, then reads it again (T365).
      await repos.packages.lock(found.packageId);
      const offer = required(await repos.offers.findById(offerId), `Offer ${offerId}`);
      const deal = await repos.deals.findByOffer(offerId);
      if (deal?.status !== "PENDING_RECONFIRMATION") {
        throw new BusinessRuleError(
          "This offer is not waiting for your reconfirmation",
          "NOT_PROMOTED",
        );
      }
      if (this.deps.clock.now() >= deal.reconfirmBy!) {
        throw new BusinessRuleError("The time to reconfirm has passed", "RECONFIRM_EXPIRED");
      }
      // Only a live backup can become the accepted offer; withdrawal and expiry release the deal,
      // and this also catches an offer past its expiry whose expiry job has not run yet (T365).
      if (offer.status !== "BACKUP") {
        throw new BusinessRuleError(
          "This offer is not waiting for your reconfirmation",
          "NOT_PROMOTED",
        );
      }
      if (action === "CONFIRM" && offer.expiresAt <= this.deps.clock.now()) {
        throw new BusinessRuleError("This offer has expired", "OFFER_EXPIRED");
      }
      const pkg = required(
        await repos.packages.findById(offer.packageId),
        `The offer's package ${offer.packageId}`,
      );
      if (action === "DECLINE") return this.declineReconfirmation(repos, deal, offer, pkg, actor);

      await repos.deals.update(deal.id, deal.version, {
        status: "OFFER_ACCEPTED",
        reconfirmBy: null,
      });
      const accepted = await repos.offers.updateStatus(offer.id, offer.version, "ACCEPTED");
      await repos.packages.update(pkg.id, pkg.version, { status: "OFFER_ACCEPTED" });
      await this.notifyAgent(repos, pkg, {
        type: "BACKUP_RECONFIRMED",
        packageId: pkg.id,
        title: "The backup investor reconfirmed",
        body: `The backup offer on the listing in ${await this.place(repos, pkg)} is now the accepted offer.`,
      });
      await this.audit(repos, actor, pkg.id, "BACKUP_RECONFIRMED", { dealId: deal.id, offerId });
      return accepted;
    });
  }

  async expireReconfirmation({ dealId }: ExpireReconfirmationPayload): Promise<void> {
    await this.uow.run(async (repos) => {
      const found = await repos.deals.findById(dealId);
      if (!found) return;
      // Ordered against the investor's answer, a withdrawal, or an expiry, then read again (T376).
      await repos.packages.lock(found.packageId);
      const deal = required(await repos.deals.findById(dealId), `Deal ${dealId}`);
      // The investor already answered, or the offer was withdrawn or expired: nothing to time out.
      if (deal.status !== "PENDING_RECONFIRMATION") return;
      const offer = required(await repos.offers.findById(deal.offerId), `Offer ${deal.offerId}`);
      const pkg = required(
        await repos.packages.findById(deal.packageId),
        `The deal's package ${deal.packageId}`,
      );
      await this.declineReconfirmation(repos, deal, offer, pkg, null);
    });
  }

  /** A promoted backup said no, or ran out of time: the agent may promote another (FR-057). */
  private async declineReconfirmation(
    repos: UnitOfWorkRepositories,
    deal: Deal,
    offer: Offer,
    pkg: ListingPackage,
    actor: Actor | null,
  ): Promise<Offer> {
    await repos.deals.update(deal.id, deal.version, { status: "RECONFIRM_DECLINED" });
    const declined = await repos.offers.updateStatus(
      offer.id,
      offer.version,
      "DECLINED_TO_RECONFIRM",
    );
    const place = await this.place(repos, pkg);
    await this.notifyAgent(repos, pkg, {
      type: "RECONFIRMATION_DECLINED",
      packageId: pkg.id,
      title: actor
        ? "The backup investor declined"
        : "The backup investor did not reconfirm in time",
      body: `The promoted backup on the listing in ${place} will not go ahead. You can promote another backup, reopen the listing, or withdraw it.`,
    });
    if (!actor) {
      await this.notifyInvestor(repos, offer.investorId, {
        type: "RECONFIRMATION_DECLINED",
        packageId: pkg.id,
        title: "Your time to reconfirm ran out",
        body: `You did not reconfirm your offer on the listing in ${place} in time, so it was released.`,
      });
    }
    await repos.audit.append({
      actorType: actor ? "USER" : "SYSTEM",
      actorId: actor?.userId ?? null,
      action: "RECONFIRMATION_DECLINED",
      entityType: "ListingPackage",
      entityId: pkg.id,
      outcome: "SUCCESS",
      details: { dealId: deal.id, offerId: offer.id, timedOut: !actor },
    });
    return declined;
  }

  /**
   * The deal and the agent's backups, ranked by estimated net proceeds (FR-056); an expired backup
   * stays on the list, marked, so the agent sees why it cannot be promoted.
   */
  private async parts(
    repos: UnitOfWorkRepositories,
    pkg: ListingPackage,
    deal: Deal,
  ): Promise<DealParts> {
    const now = this.deps.clock.now();
    const offer = required(await repos.offers.findById(deal.offerId), `Offer ${deal.offerId}`);
    const backups = (await repos.offers.listByPackage(pkg.id, pkg.round)).filter(
      (o) => o.status === "BACKUP" && o.id !== offer.id,
    );
    const names = await repos.investors.findCompanyNames([
      offer.investorId,
      ...backups.map((b) => b.investorId),
    ]);
    const inactive = await repos.investors.findInactive(backups.map((b) => b.investorId));
    const assumptions = await readConfig(repos.config, "netProceeds");
    return {
      deal,
      offer,
      investorName: names.get(offer.investorId) ?? "Investor",
      allowedNextMilestones: allowedNext(deal.status),
      backups: backups
        .map((backup) => ({
          offer: backup,
          investorName: names.get(backup.investorId) ?? "Investor",
          investorActive: !inactive.has(backup.investorId),
          ...computeNetProceeds(backup, assumptions),
          expired: backup.expiresAt <= now,
        }))
        .sort((a, b) => b.netProceeds - a.netProceeds),
    };
  }

  private async ownDeal(repos: UnitOfWorkRepositories, agentId: string, dealId: string) {
    const deal = await repos.deals.findById(dealId);
    const pkg = deal && (await repos.packages.findForAgent(agentId, deal.packageId));
    if (!deal || !pkg) throw new NotFoundError(NOT_FOUND);
    return { deal, pkg };
  }

  private async place(repos: UnitOfWorkRepositories, pkg: ListingPackage) {
    return placeOf(await repos.properties.findById(pkg.propertyId));
  }

  private notifyInvestor(
    repos: UnitOfWorkRepositories,
    investorId: string,
    notice: InvestorNotice,
  ) {
    return notifyInvestor(repos, investorId, notice);
  }

  private async notifyAgent(repos: UnitOfWorkRepositories, pkg: ListingPackage, notice: Notice) {
    const userId = await repos.users.findIdByAgentId(pkg.agentId);
    if (userId) await repos.notifications.create({ userId, ...notice });
  }

  private audit(
    repos: UnitOfWorkRepositories,
    actor: Actor,
    packageId: string,
    action: "DEAL_MILESTONE" | "DEAL_FELL_THROUGH" | "BACKUP_PROMOTED" | "BACKUP_RECONFIRMED",
    details: Record<string, unknown>,
  ) {
    return repos.audit.append({
      actorType: "USER",
      actorId: actor.userId,
      action,
      entityType: "ListingPackage",
      entityId: packageId,
      outcome: "SUCCESS",
      details,
    });
  }
}
