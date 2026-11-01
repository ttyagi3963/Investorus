// The offer comparison (T308; FR-050, FR-051): every offer still in play, side by side, with the
// seller's estimated net proceeds and the subtractions behind it, sortable three ways, and the fee
// assumptions used, so the screen can explain the figure.
import { z } from "zod";
import type { NetProceedsAssumptions } from "../config/config.js";
import type { OfferView } from "./offer.js";

export const COMPARISON_SORTS = ["netProceeds", "closingDate", "certainty"] as const;
export type ComparisonSort = (typeof COMPARISON_SORTS)[number];

/** GET /listing-packages/:id/offer-comparison?sort= */
export const comparisonQuerySchema = z.object({
  sort: z.enum(COMPARISON_SORTS).default("netProceeds"),
});

/** One line of the net-proceeds explanation: the price, then each subtraction as a negative. */
export type NetProceedsLine = { label: string; amount: number };

export type OfferComparisonRow = {
  offer: OfferView;
  investorName: string;
  netProceeds: number;
  breakdown: NetProceedsLine[];
  /** Lower is more certain: fewer contingencies, and cash ahead of financed on a tie. */
  certaintyRank: number;
  expired: boolean;
  /** Whether the seller can accept it now: an active offer, unexpired, while offers are open. */
  acceptable: boolean;
};

export type OfferComparisonView = {
  rows: OfferComparisonRow[];
  assumptions: NetProceedsAssumptions;
};
