// Releases a promoted backup whose offer was withdrawn or expired (T365; FR-057, FR-059): its deal
// waiting for reconfirmation is declined in the same transaction, so the offer can never be
// reconfirmed into an accepted one (which would reveal the seller), and the agent, told at once,
// can promote another backup. Does nothing for an offer that was not promoted.
import type { Actor } from "@clever/contracts/auth";
import type { Offer } from "@clever/contracts/offer";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { placeOf } from "../notice-text.js";

const WHY = {
  WITHDRAWN: "The promoted backup investor withdrew",
  EXPIRED: "The promoted backup's offer expired",
} as const;

export async function releasePromotedBackup(
  repos: UnitOfWorkRepositories,
  offer: Offer,
  reason: keyof typeof WHY,
  actor: Actor | null,
): Promise<void> {
  const deal = await repos.deals.findByOffer(offer.id);
  if (deal?.status !== "PENDING_RECONFIRMATION") return;
  await repos.deals.update(deal.id, deal.version, { status: "RECONFIRM_DECLINED" });

  const pkg = await repos.packages.findById(offer.packageId);
  const agentUserId = pkg && (await repos.users.findIdByAgentId(pkg.agentId));
  if (pkg && agentUserId) {
    const place = placeOf(await repos.properties.findById(pkg.propertyId));
    await repos.notifications.create({
      userId: agentUserId,
      type: "RECONFIRMATION_DECLINED",
      packageId: pkg.id,
      title: WHY[reason],
      body: `The promoted backup on the listing in ${place} will not go ahead. You can promote another backup, reopen the listing, or withdraw it.`,
    });
  }
  await repos.audit.append({
    actorType: actor ? "USER" : "SYSTEM",
    actorId: actor?.userId ?? null,
    action: "RECONFIRMATION_DECLINED",
    entityType: "ListingPackage",
    entityId: offer.packageId,
    outcome: "SUCCESS",
    details: { dealId: deal.id, offerId: offer.id, reason },
  });
}
