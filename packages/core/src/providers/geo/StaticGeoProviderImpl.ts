// Looks a ZIP up (T067, T421): the Los Angeles County names in zips.ts first, then every US ZIP in
// us-zips.ts, read into a map once on first use. A ZIP that exists nowhere returns null: a listing
// still accepts it as an unknown place, while a buy box or an import refuses it, since it could
// never match a listing.
import type { IGeoProvider, ZipInfo } from "./IGeoProvider.js";
import { US_ZIPS } from "./us-zips.js";
import { ZIPS } from "./zips.js";

let national: Map<string, ZipInfo> | null = null;

function nationalZips(): Map<string, ZipInfo> {
  if (!national) {
    national = new Map();
    for (const line of US_ZIPS.split("\n")) {
      const [zip, city, state] = line.split(",");
      if (zip && city && state) national.set(zip, { city, state, neighborhood: city });
    }
  }
  return national;
}

export class StaticGeoProviderImpl implements IGeoProvider {
  lookup(zip: string): ZipInfo | null {
    return ZIPS[zip] ?? nationalZips().get(zip) ?? null;
  }
}
