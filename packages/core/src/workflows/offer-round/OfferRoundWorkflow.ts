// What the offer round's timers do when they run (T306; FR-044, FR-059). At the deadline, a round
// with no open offers moves the package to NO_OFFERS_RECEIVED and tells the agent; a round with
// offers stays open for the seller's decision (new offers are already refused after the deadline).
// At an offer's expiry, a still-open offer becomes EXPIRED and its investor is told. Each run
// re-reads the rows and does nothing when its job is stale, so a late or repeated job is harmless.
import type { CloseOfferRoundPayload, ExpireOfferPayload } from "@clever/contracts/jobs";
import { OPEN_OFFER_STATUSES } from "../../repositories/offer/IOfferRepository.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";
import { notifyInvestor } from "../../outbox/notify-investor.js";

export interface IOfferRoundWorkflow {
  closeRound(payload: CloseOfferRoundPayload): Promise<void>;
  expireOffer(payload: ExpireOfferPayload): Promise<void>;
}

const system = { actorType: "SYSTEM" as const, actorId: null, outcome: "SUCCESS" as const };

export class OfferRoundWorkflow implements IOfferRoundWorkflow {
  constructor(private readonly uow: IUnitOfWork) {}

  async closeRound({ packageId, round, offerDeadline }: CloseOfferRoundPayload): Promise<void> {
    await this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(packageId);
      // A later deadline has its own job, and a decided or withdrawn package has no round to close.
      if (
        pkg?.status !== "ACCEPTING_OFFERS" ||
        pkg.round !== round ||
        pkg.offerDeadline?.toISOString() !== offerDeadline
      ) {
        return;
      }
      const offers = await repos.offers.listByPackage(packageId, round);
      const openOffers = offers.filter((o) => o.status === "ACTIVE" || o.status === "COUNTERED");
      if (openOffers.length === 0) {
        await repos.packages.update(packageId, pkg.version, { status: "NO_OFFERS_RECEIVED" });
      }
      const agentUserId = await repos.users.findIdByAgentId(pkg.agentId);
      if (agentUserId) {
        const place = placeOf(await repos.properties.findById(pkg.propertyId));
        await repos.notifications.create({
          userId: agentUserId,
          type: "OFFER_ROUND_CLOSED",
          packageId,
          title: openOffers.length === 0 ? "No offers came in" : "Offers are ready to compare",
          body:
            openOffers.length === 0
              ? `The offer deadline passed for the listing in ${place} with no offers. You can extend the deadline, reopen it, or withdraw it.`
              : `The offer deadline passed for the listing in ${place}. ${openOffers.length} offer(s) are ready to compare.`,
        });
      }
      await repos.audit.append({
        ...system,
        action: "OFFER_ROUND_CLOSED",
        entityType: "ListingPackage",
        entityId: packageId,
        details: { round, openOffers: openOffers.length },
      });
    });
  }

  async expireOffer({ offerId, revision }: ExpireOfferPayload): Promise<void> {
    await this.uow.run(async (repos) => {
      const offer = await repos.offers.findById(offerId);
      // A newer revision has its own expiry, and a decided offer no longer expires.
      if (
        !offer ||
        offer.currentRevision !== revision ||
        !OPEN_OFFER_STATUSES.includes(offer.status)
      ) {
        return;
      }
      await repos.offers.updateStatus(offerId, offer.version, "EXPIRED");
      const pkg = await repos.packages.findById(offer.packageId);
      const property = pkg && (await repos.properties.findById(pkg.propertyId));
      await notifyInvestor(repos, offer.investorId, {
        type: "OFFER_EXPIRED",
        packageId: offer.packageId,
        title: "Your offer expired",
        body: `Your offer on the listing in ${placeOf(property)} reached its expiry and can no longer be accepted.`,
      });
      await repos.audit.append({
        ...system,
        action: "OFFER_EXPIRED",
        entityType: "ListingPackage",
        entityId: offer.packageId,
        details: { offerId, revision },
      });
    });
  }
}
