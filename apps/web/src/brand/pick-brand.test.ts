// Guards brand resolution (T349; FR-092): the switcher's cookie wins only when it names a real brand,
// then the host decides, then the default.
import { describe, expect, it } from "vitest";
import { pickBrand } from "./pick-brand";

const brands = [
  { brandId: "clever", displayName: "Clever", hosts: ["localhost"] },
  { brandId: "larkspur", displayName: "Larkspur", hosts: ["partner.localhost"] },
];

describe("pickBrand", () => {
  it("takes a known cookie, ignores an unknown one for the host, and falls back to the default", () => {
    const pick = (cookie: string | undefined, host: string | null) =>
      pickBrand(brands, { cookie, host, defaultBrandId: "clever" });

    expect(pick("larkspur", "localhost:3000")).toBe("larkspur");
    expect(pick("forged", "Partner.localhost:3000")).toBe("larkspur");
    expect(pick(undefined, "example.test")).toBe("clever");
  });
});
