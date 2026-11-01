// What a matched investor reads (T298, contracts/api.md): their packages, newest first, and one
// package. Each answer is the investor view, which leaves out the seller and the street (SC-006),
// except the winning investor's, which adds them (T312);
// the photos' short-lived read links are signed on the way.
import {
  toInvestorPackageSummary,
  toInvestorPackageView,
  toWinningInvestorPackageView,
  type InvestorPackageParts,
} from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { IInvestorPackageQueryService, InvestorPackage } from "@clever/core";
import { Router } from "express";

export type SignPhotos = (photos: Photo[]) => Promise<(Photo & { url: string })[]>;

export function createInvestorRouter(
  investorPackages: IInvestorPackageQueryService,
  signPhotos: SignPhotos,
): Router {
  const signed = async (found: InvestorPackage): Promise<InvestorPackageParts> => ({
    ...found,
    photos: await signPhotos(found.photos),
  });
  const router = Router();
  router.get("/investor/packages", async (_req, res) => {
    const found = await investorPackages.listMatched(res.locals.actor);
    const parts = await Promise.all(found.map(signed));
    res.status(200).json(parts.map(toInvestorPackageSummary));
  });
  router.get("/investor/packages/:id", async (req, res) => {
    const found = await investorPackages.getForInvestor(res.locals.actor, req.params.id);
    const parts = await signed(found);
    // Only the winning investor's read carries the seller (the service decides and audits it).
    res
      .status(200)
      .json(
        found.seller
          ? toWinningInvestorPackageView(parts, found.seller)
          : toInvestorPackageView(parts),
      );
  });
  return router;
}
