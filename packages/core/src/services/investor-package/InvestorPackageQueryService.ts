// What an investor can read (T295; FR-040, SC-006): the packages they were matched to in each
// package's current round, newest first, each with their own offer. Any other package is "not
// found", so an investor learns nothing about it. The route maps the parts to the investor views,
// which leave out the seller and the street.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError, NotFoundError } from "@clever/contracts/common";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Match } from "@clever/contracts/match";
import type { Offer } from "@clever/contracts/offer";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** A matched package as its investor sees it, before the photos' read links are signed. */
export type InvestorPackage = {
  package: ListingPackage;
  property: Property;
  photos: Photo[];
  myOffer: Offer | null;
  matchedAt: Date;
};

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
      return load(repos, pkg, match);
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
  return { package: pkg, property, photos, myOffer, matchedAt: match.firstMatchedAt };
}
