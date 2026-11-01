// What the api sends for a buy box (T323; contracts/api.md): the box as saved, without the investor
// ID, since an investor only ever reads their own.
import type { BuyBox } from "./buy-box.js";

export type BuyBoxView = Omit<BuyBox, "investorId">;

export function toBuyBoxView({ investorId: _investorId, ...box }: BuyBox): BuyBoxView {
  return box;
}
