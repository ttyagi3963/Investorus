// The ZIP reference set for the demo markets (Austin, Dallas, Phoenix, Atlanta). The prototype
// needs no outside address service; production would swap StaticGeoProviderImpl for USPS or Smarty.
import type { ZipInfo } from "./IGeoProvider.js";

export const ZIPS: Record<string, ZipInfo> = {
  "78701": { city: "Austin", state: "TX", neighborhood: "Downtown" },
  "78702": { city: "Austin", state: "TX", neighborhood: "East Austin" },
  "78703": { city: "Austin", state: "TX", neighborhood: "Clarksville" },
  "78704": { city: "Austin", state: "TX", neighborhood: "South Austin" },
  "78705": { city: "Austin", state: "TX", neighborhood: "Hyde Park" },
  "78745": { city: "Austin", state: "TX", neighborhood: "Southwest Austin" },
  "75201": { city: "Dallas", state: "TX", neighborhood: "Downtown" },
  "75204": { city: "Dallas", state: "TX", neighborhood: "Uptown" },
  "75206": { city: "Dallas", state: "TX", neighborhood: "Lower Greenville" },
  "75214": { city: "Dallas", state: "TX", neighborhood: "Lakewood" },
  "75219": { city: "Dallas", state: "TX", neighborhood: "Oak Lawn" },
  "85003": { city: "Phoenix", state: "AZ", neighborhood: "Downtown" },
  "85006": { city: "Phoenix", state: "AZ", neighborhood: "Garfield" },
  "85012": { city: "Phoenix", state: "AZ", neighborhood: "Midtown" },
  "85016": { city: "Phoenix", state: "AZ", neighborhood: "Biltmore" },
  "30303": { city: "Atlanta", state: "GA", neighborhood: "Downtown" },
  "30306": { city: "Atlanta", state: "GA", neighborhood: "Virginia-Highland" },
  "30307": { city: "Atlanta", state: "GA", neighborhood: "Inman Park" },
  "30308": { city: "Atlanta", state: "GA", neighborhood: "Midtown" },
  "30309": { city: "Atlanta", state: "GA", neighborhood: "Ansley Park" },
};
