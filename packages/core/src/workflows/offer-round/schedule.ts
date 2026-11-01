// The offer round's timers (T306; FR-059, constitution VIII), queued in the same change that sets
// the time, so a deadline or an expiry is never lost to a crash. The dedupe key names the deadline
// or the revision, so a later deadline or a new revision gets its own job and the old one finds
// itself stale.
import type { CloseOfferRoundPayload, ExpireOfferPayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Offer } from "@clever/contracts/offer";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** CLOSE_OFFER_ROUND at the package's deadline. */
export async function scheduleRoundClose(repos: UnitOfWorkRepositories, pkg: ListingPackage) {
  if (!pkg.offerDeadline) return;
  const payload: CloseOfferRoundPayload = {
    packageId: pkg.id,
    round: pkg.round,
    offerDeadline: pkg.offerDeadline.toISOString(),
  };
  await repos.jobs.enqueue({
    type: "CLOSE_OFFER_ROUND",
    dedupeKey: `CLOSE_OFFER_ROUND:${pkg.id}:${pkg.round}:${payload.offerDeadline}`,
    payload,
    runAt: pkg.offerDeadline,
  });
}

/** EXPIRE_OFFER at the expiry of the offer's current revision. */
export async function scheduleOfferExpiry(repos: UnitOfWorkRepositories, offer: Offer) {
  const payload: ExpireOfferPayload = { offerId: offer.id, revision: offer.currentRevision };
  await repos.jobs.enqueue({
    type: "EXPIRE_OFFER",
    dedupeKey: `EXPIRE_OFFER:${offer.id}:${offer.currentRevision}`,
    payload,
    runAt: offer.expiresAt,
  });
}
