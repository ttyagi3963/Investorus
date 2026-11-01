// What an investor can read (T295; FR-040, SC-006): the packages they were matched to in each
// package's current round, newest first, each with their own offer. Any other package is "not
// found", so an investor learns nothing about it. The route maps the parts to the investor views,
// which leave out the seller and the street. Only the investor whose offer won the package's
// active or closed deal also gets the seller's contact and the street, and each such read is
// audited (T312; FR-031); a backup or a buyer whose deal fell through never does.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError, NotFoundError } from "@clever/contracts/common";
import type { Deal, DealStatus } from "@clever/contracts/deal";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Match } from "@clever/contracts/match";
import type { Offer } from "@clever/contracts/offer";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** A matched package as its investor sees it, before the photos' read links are signed. */
export type InvestorPackage = {
  package: ListingPackage;
  property: Property;
  photos: Photo[];
  myOffer: Offer | null;
  myDeal: Deal | null;
  matchedAt: Date;
  /** Set only for the winning investor's own read (FR-031). */
  seller?: Seller;
};

/** The deal statuses in which the winner sees the seller: accepted through closed. */
const REVEALED: DealStatus[] = [
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
];

export interface IInvestorPackageQueryService {
  listMatched(actor: Actor): Promise<InvestorPackage[]>;
  getForInvestor(actor: Actor, packageId: string): Promise<InvestorPackage>;
}

const NOT_FOUND = "Package not found";

export function investorOf(actor: Actor): string {
  if (actor.role !== "INVESTOR") throw new ForbiddenError("Only investors see matched packages");
  return actor.investorId;
}

export class InvestorPackageQueryService implements IInvestorPackageQueryService {
  constructor(private readonly uow: IUnitOfWork) {}

  async listMatched(actor: Actor): Promise<InvestorPackage[]> {
    const investorId = investorOf(actor);
    return this.uow.run(async (repos) => {
      const found: InvestorPackage[] = [];
      for (const match of await repos.matches.listForInvestor(investorId)) {
        const pkg = await repos.packages.findById(match.packageId);
        // A match from an earlier round no longer grants access.
        if (pkg && pkg.round === match.round) found.push(await load(repos, pkg, match));
      }
      return found;
    });
  }

  async getForInvestor(actor: Actor, packageId: string): Promise<InvestorPackage> {
    const investorId = investorOf(actor);
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(packageId);
      const match = pkg && (await repos.matches.findOne(packageId, investorId, pkg.round));
      if (!pkg || !match) throw new NotFoundError(NOT_FOUND);
      const found = await load(repos, pkg, match);
      const won =
        found.myOffer?.status === "ACCEPTED" &&
        found.myDeal !== null &&
        REVEALED.includes(found.myDeal.status);
      if (!won) return found;
      const seller = await repos.sellers.findById(pkg.sellerId);
      if (!seller) throw new NotFoundError(NOT_FOUND);
      await repos.audit.append({
        actorType: "USER",
        actorId: actor.userId,
        action: "PII_ACCESSED",
        entityType: "ListingPackage",
        entityId: packageId,
        outcome: "SUCCESS",
        details: { investorId, fields: ["seller", "streetLine"] },
      });
      return { ...found, seller };
    });
  }
}

async function load(
  repos: UnitOfWorkRepositories,
  pkg: ListingPackage,
  match: Match,
): Promise<InvestorPackage> {
  const [property, photos, myOffer] = await Promise.all([
    repos.properties.findById(pkg.propertyId),
    repos.photos.listByPackage(pkg.id),
    repos.offers.findLatest(pkg.id, match.investorId, pkg.round),
  ]);
  if (!property) throw new NotFoundError(NOT_FOUND);
  const myDeal = myOffer && (await repos.deals.findByOffer(myOffer.id));
  return { package: pkg, property, photos, myOffer, myDeal, matchedAt: match.firstMatchedAt };
}
