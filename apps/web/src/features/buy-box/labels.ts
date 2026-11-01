// The words the buy box screens use for strategies and statuses (T324), in one place, and the pages'
// description and the short line that sums up a box's main criteria (T331).
import type { BuyBoxStatus, BuyBoxStrategy, BuyBoxView } from "@clever/contracts/buy-box";
import { formatUsd, PROPERTY_TYPE_LABELS } from "@/features/listing-package/labels";

export const STRATEGY_LABELS: Record<BuyBoxStrategy, string> = {
  FIX_FLIP: "Fix and flip",
  BUY_HOLD: "Buy and hold",
  WHOLESALE: "Wholesale",
  NOVATION: "Novation",
  SELLER_FINANCE: "Seller finance",
};

export const BUY_BOX_STATUS_LABELS: Record<BuyBoxStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
};

/** The line under the buy box pages' titles. */
export const BUY_BOXES_DESCRIPTION =
  "Tell us what you buy. A home is sent to you only when it fits every rule in a box.";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where, the price ceiling, and the property types, for example "2 ZIP codes · up to $300,000". */
export function buyBoxSummary(box: BuyBoxView): string {
  const where =
    box.geographyMode === "NATIONWIDE"
      ? "Nationwide"
      : box.geographyMode === "STATES"
        ? box.geography.join(", ")
        : count(box.geography.length, "ZIP code", "ZIP codes");
  const types =
    box.propertyTypes === null
      ? "any property type"
      : box.propertyTypes.length <= 2
        ? box.propertyTypes.map((type) => PROPERTY_TYPE_LABELS[type].toLowerCase()).join(", ")
        : count(box.propertyTypes.length, "property type", "property types");
  return [
    where,
    box.priceMax === null ? "any price" : `up to ${formatUsd(box.priceMax)}`,
    types,
  ].join(" · ");
}
