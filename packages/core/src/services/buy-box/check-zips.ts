// The one buy box rule the registry's schema cannot hold (T321; FR-060): every ZIP code a ZIPS box
// lists must be one the ZIP lookup knows, or the box could never match. The service and the legacy
// import both use it, so the refusal reads the same.
import type { BuyBoxInput } from "@clever/contracts/buy-box";
import { ValidationError } from "@clever/contracts/common";
import type { IGeoProvider } from "../../providers/geo/IGeoProvider.js";

export function checkZips(
  box: Pick<BuyBoxInput, "geographyMode" | "geography">,
  geo: IGeoProvider,
) {
  if (box.geographyMode !== "ZIPS") return;
  const unknown = box.geography.find((zip) => geo.lookup(zip) === null);
  if (unknown !== undefined) {
    throw new ValidationError("Some fields need fixing. See the messages below.", [
      { field: "geography", message: `ZIP ${unknown} is not a valid ZIP code` },
    ]);
  }
}
