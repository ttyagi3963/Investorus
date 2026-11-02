// The agent's offer comparison (T308; FR-050, FR-051): every offer still in play on the package's
// current round (active, countered, or backup), with the investor's name, the estimated net
// proceeds and their breakdown, the certainty rank, whether operations deactivated the investor
// (flagged, not hidden; T370), and whether the seller can accept it now. The
// fee assumptions come from config and are returned with the rows. Only the package's agent sees it.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError, NotFoundError } from "@clever/contracts/common";
import type { NetProceedsAssumptions } from "@clever/contracts/config";
import {
  comparisonQuerySchema,
  type ComparisonSort,
  type Offer,
  type OfferStatus,
} from "@clever/contracts/offer";
import type { IClock } from "../../providers/clock/IClock.js";
import { readConfig } from "../../repositories/config/read-config.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { certaintyRank, computeNetProceeds } from "./net-proceeds.js";

/** A comparison row before the route maps the offer to its view. */
export type ComparisonEntry = {
  offer: Offer;
  investorName: string;
  investorActive: boolean;
  netProceeds: number;
  breakdown: { label: string; amount: number }[];
  certaintyRank: number;
  expired: boolean;
  acceptable: boolean;
};

export interface IOfferComparisonService {
  compare(
    actor: Actor,
    packageId: string,
    query: unknown,
  ): Promise<{ rows: ComparisonEntry[]; assumptions: NetProceedsAssumptions }>;
}

const IN_PLAY: OfferStatus[] = ["ACTIVE", "COUNTERED", "BACKUP"];

const ORDER: Record<ComparisonSort, (a: ComparisonEntry, b: ComparisonEntry) => number> = {
  netProceeds: (a, b) => b.netProceeds - a.netProceeds,
  closingDate: (a, b) => a.offer.closingDate.localeCompare(b.offer.closingDate),
  certainty: (a, b) => a.certaintyRank - b.certaintyRank,
};

export class OfferComparisonService implements IOfferComparisonService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async compare(actor: Actor, packageId: string, query: unknown) {
    if (actor.role !== "AGENT")
      throw new ForbiddenError("Only the package's agent compares offers");
    const { sort } = comparisonQuerySchema.parse(query);
    const now = this.deps.clock.now();
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findForAgent(actor.agentId, packageId);
      if (!pkg) throw new NotFoundError("Package not found");
      const assumptions = await readConfig(repos.config, "netProceeds");
      const offers = (await repos.offers.listByPackage(packageId, pkg.round)).filter((o) =>
        IN_PLAY.includes(o.status),
      );
      const investorIds = offers.map((o) => o.investorId);
      const names = await repos.investors.findCompanyNames(investorIds);
      const inactive = await repos.investors.findInactive(investorIds);
      const rows = offers.map((offer): ComparisonEntry => {
        const expired = offer.expiresAt <= now;
        return {
          offer,
          investorName: names.get(offer.investorId) ?? "Investor",
          investorActive: !inactive.has(offer.investorId),
          ...computeNetProceeds(offer, assumptions),
          certaintyRank: certaintyRank(offer),
          expired,
          acceptable:
            offer.status === "ACTIVE" &&
            !expired &&
            !inactive.has(offer.investorId) &&
            pkg.status === "ACCEPTING_OFFERS",
        };
      });
      // Ties keep the order offers came in, so the list never shuffles between loads.
      return { rows: rows.sort(ORDER[sort]), assumptions };
    });
  }
}
