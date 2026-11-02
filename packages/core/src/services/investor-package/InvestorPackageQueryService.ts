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
import type { Offer, OfferTerms } from "@clever/contracts/offer";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** A matched package as its investor sees it, before the photos' addresses are added. */
export type InvestorPackage = {
  package: ListingPackage;
  property: Property;
  photos: Photo[];
  myOffer: Offer | null;
  /** The investor's own last terms while the agent's counter stands in for them (T377). */
  myOwnTerms: OfferTerms | null;
  /** Only what the investor may see of their deal: never the agent's fall-through reason. */
  myDeal: Pick<Deal, "status" | "reconfirmBy"> | null;
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

/** A matched package's row in the investor's list: no deal, no counter terms, no seller. */
export type InvestorPackageRow = Omit<InvestorPackage, "myOwnTerms" | "myDeal" | "seller">;

export interface IInvestorPackageQueryService {
  listMatched(actor: Actor): Promise<InvestorPackageRow[]>;
  getForInvestor(actor: Actor, packageId: string): Promise<InvestorPackage>;
}

const NOT_FOUND = "Package not found";

export function investorOf(actor: Actor): string {
  if (actor.role !== "INVESTOR") throw new ForbiddenError("Only investors see matched packages");
  return actor.investorId;
}

export class InvestorPackageQueryService implements IInvestorPackageQueryService {
  constructor(private readonly uow: IUnitOfWork) {}

  async listMatched(actor: Actor): Promise<InvestorPackageRow[]> {
    const investorId = investorOf(actor);
    return this.uow.run(async (repos) => {
      const current: { pkg: ListingPackage; match: Match }[] = [];
      for (const match of await repos.matches.listForInvestor(investorId)) {
        const pkg = await repos.packages.findById(match.packageId);
        // A match from an earlier round no longer grants access.
        if (pkg && pkg.round === match.round) current.push({ pkg, match });
      }
      // A list row needs no deal or counter terms; its properties and photos each come in one
      // query (T386, T396).
      const [properties, photos] = await Promise.all([
        repos.properties.findByIds(current.map(({ pkg }) => pkg.propertyId)),
        repos.photos.listByPackages(current.map(({ pkg }) => pkg.id)),
      ]);
      return Promise.all(
        current.map(async ({ pkg, match }) => {
          const property = properties.get(pkg.propertyId);
          if (!property) throw new NotFoundError(NOT_FOUND);
          const myOffer = await repos.offers.findLatest(pkg.id, investorId, pkg.round);
          return {
            package: pkg,
            property,
            photos: photos.get(pkg.id) ?? [],
            myOffer,
            matchedAt: match.firstMatchedAt,
          };
        }),
      );
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
  const deal = myOffer && (await repos.deals.findByOffer(myOffer.id));
  const myDeal = deal ? { status: deal.status, reconfirmBy: deal.reconfirmBy } : null;
  const myOwnTerms =
    myOffer?.status === "COUNTERED"
      ? await repos.offers.findLastTerms(myOffer.id, "INVESTOR")
      : null;
  return {
    package: pkg,
    property,
    photos,
    myOffer,
    myOwnTerms,
    myDeal,
    matchedAt: match.firstMatchedAt,
  };
}
