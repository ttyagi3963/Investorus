// Guards the ZIP lookup (T421): it knows every real US ZIP, not only the seeded ones, with its town
// and state; the seeded ZIPs keep their neighborhood names; a ZIP that exists nowhere is unknown.
import { describe, expect, it } from "vitest";
import { StaticGeoProviderImpl } from "./StaticGeoProviderImpl.js";

describe("StaticGeoProviderImpl", () => {
  const geo = new StaticGeoProviderImpl();

  it("knows every US ZIP, Los Angeles County's by name with the seeded neighborhoods, and no made-up ZIP", () => {
    expect(geo.lookup("90025")).toMatchObject({ city: "Los Angeles", state: "CA" });
    expect(geo.lookup("90210")).toMatchObject({ city: "Beverly Hills", state: "CA" });
    expect(geo.lookup("90016")).toEqual({
      city: "Los Angeles",
      state: "CA",
      neighborhood: "West Adams",
    });
    expect(geo.lookup("10001")).toEqual({
      city: "New York",
      state: "NY",
      neighborhood: "New York",
    });
    expect(geo.lookup("99999")).toBeNull();
  });
});
