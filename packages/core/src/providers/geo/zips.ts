// The ZIP reference set: the Los Angeles demo market the seed uses (T409), plus the Austin ZIPs the
// tests' fixtures use. The prototype needs no outside address service; production would swap
// StaticGeoProviderImpl for USPS or Smarty.
import type { ZipInfo } from "./IGeoProvider.js";

export const ZIPS: Record<string, ZipInfo> = {
  "90016": { city: "Los Angeles", state: "CA", neighborhood: "West Adams" },
  "90019": { city: "Los Angeles", state: "CA", neighborhood: "Mid-City" },
  "90026": { city: "Los Angeles", state: "CA", neighborhood: "Echo Park" },
  "90027": { city: "Los Angeles", state: "CA", neighborhood: "Los Feliz" },
  "90034": { city: "Los Angeles", state: "CA", neighborhood: "Palms" },
  "90039": { city: "Los Angeles", state: "CA", neighborhood: "Atwater Village" },
  "90042": { city: "Los Angeles", state: "CA", neighborhood: "Highland Park" },
  "90065": { city: "Los Angeles", state: "CA", neighborhood: "Glassell Park" },
  "90066": { city: "Los Angeles", state: "CA", neighborhood: "Mar Vista" },
  "90291": { city: "Los Angeles", state: "CA", neighborhood: "Venice" },
  "90301": { city: "Inglewood", state: "CA", neighborhood: "Inglewood" },
  "91406": { city: "Los Angeles", state: "CA", neighborhood: "Van Nuys" },
  "78701": { city: "Austin", state: "TX", neighborhood: "Downtown" },
  "78702": { city: "Austin", state: "TX", neighborhood: "East Austin" },
  "78703": { city: "Austin", state: "TX", neighborhood: "Clarksville" },
  "78704": { city: "Austin", state: "TX", neighborhood: "South Austin" },
  "78745": { city: "Austin", state: "TX", neighborhood: "Southwest Austin" },
};
