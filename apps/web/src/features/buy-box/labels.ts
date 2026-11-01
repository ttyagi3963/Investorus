// The words the buy box screens use for strategies and statuses (T324), in one place.
import type { BuyBoxStatus, BuyBoxStrategy } from "@clever/contracts/buy-box";

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
