// What a matched investor reads (T298, contracts/api.md): their packages, newest first, and one
// package. Each answer is the investor view, which leaves out the seller and the street (SC-006);
// the winning investor's read, which the service marks and audits, adds them (T312);
// the photos' public addresses are added on the way.
import {
  toInvestorPackageSummary,
  toInvestorPackageResponse,
} from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { IInvestorPackageQueryService } from "@clever/core";
import { Router } from "express";

export type AddPhotoUrls = (photos: Photo[]) => (Photo & { url: string })[];

export function createInvestorRouter(
  investorPackages: IInvestorPackageQueryService,
  addPhotoUrls: AddPhotoUrls,
): Router {
  const withUrls = <T extends { photos: Photo[] }>(found: T) => ({
    ...found,
    photos: addPhotoUrls(found.photos),
  });
  const router = Router();
  router.get("/investor/packages", async (_req, res) => {
    const found = await investorPackages.listMatched(res.locals.actor);
    res.status(200).json(found.map(withUrls).map(toInvestorPackageSummary));
  });
  router.get("/investor/packages/:id", async (req, res) => {
    const found = await investorPackages.getForInvestor(res.locals.actor, req.params.id);
    res.status(200).json(toInvestorPackageResponse(withUrls(found)));
  });
  return router;
}
