// Looks a ZIP up in the bundled reference set (T067). An unknown ZIP returns null, and the service
// rejects it on the `property.zip` field.
import type { IGeoProvider, ZipInfo } from "./IGeoProvider.js";
import { ZIPS } from "./zips.js";

export class StaticGeoProviderImpl implements IGeoProvider {
  lookup(zip: string): ZipInfo | null {
    return ZIPS[zip] ?? null;
  }
}
