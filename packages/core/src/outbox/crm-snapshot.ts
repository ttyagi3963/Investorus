// The listing as the CRM should show it after a change (T337; FR-077): its status and round, the
// offers made in the round, and, once an offer is accepted, its price. Taken inside the change, so
// the CRM's copy matches what the platform saved at that moment.
import type { CrmSnapshot } from "@clever/contracts/events";
import type { ListingPackage, PackageStatus } from "@clever/contracts/listing-package";
import type { UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";

const ACCEPTED: readonly PackageStatus[] = [
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
];

export async function crmSnapshot(
  repos: Pick<UnitOfWorkRepositories, "offers" | "deals">,
  pkg: ListingPackage,
): Promise<CrmSnapshot> {
  const offers = await repos.offers.listByPackage(pkg.id, pkg.round);
  let acceptedPrice: number | null = null;
  if (ACCEPTED.includes(pkg.status)) {
    const deal = await repos.deals.findLatestByPackage(pkg.id);
    acceptedPrice = (deal && offers.find((offer) => offer.id === deal.offerId)?.price) ?? null;
  }
  return {
    status: pkg.status,
    round: pkg.round,
    offerCount: offers.filter((offer) => offer.status !== "WITHDRAWN").length,
    acceptedPrice,
  };
}
