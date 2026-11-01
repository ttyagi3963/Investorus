// How the seller's net proceeds and an offer's certainty are estimated (T308; FR-050, FR-051), the
// same way for every offer: the price, less the investor's fees and concessions, a share of the
// price for closing costs, and the flat fees, each kept as a line so the screen can explain it.
import type { NetProceedsAssumptions } from "@clever/contracts/config";
import type { NetProceedsLine, OfferTerms } from "@clever/contracts/offer";

export function computeNetProceeds(
  offer: Pick<OfferTerms, "price" | "feesAndConcessions">,
  { closingCostPct, flatFees }: NetProceedsAssumptions,
): { netProceeds: number; breakdown: NetProceedsLine[] } {
  const breakdown: NetProceedsLine[] = [
    { label: "Offer price", amount: offer.price },
    { label: "Fees and concessions", amount: -offer.feesAndConcessions },
    {
      label: `Closing costs (${+(closingCostPct * 100).toFixed(2)}% of the price)`,
      amount: -Math.round(offer.price * closingCostPct),
    },
    { label: "Flat fees", amount: -flatFees },
  ];
  return { netProceeds: breakdown.reduce((sum, line) => sum + line.amount, 0), breakdown };
}

/** Lower is more certain: each contingency counts, and financing breaks a tie against cash. */
export const certaintyRank = (offer: Pick<OfferTerms, "contingencies" | "paymentType">) =>
  offer.contingencies.length * 2 + (offer.paymentType === "FINANCED" ? 1 : 0);
