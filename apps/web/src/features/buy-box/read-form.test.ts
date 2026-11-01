// Guards how the buy box editor reads "any" (T324; FR-025): a blank number and a list left at "any"
// are sent as null, while "only these" with nothing checked is sent as an empty list, so the api can
// refuse it with its reason instead of the form quietly turning it into "any".
import { describe, expect, it } from "vitest";
import { ANY, LISTED, NO_STRATEGY, ONLY, readForm } from "./read-form";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

const base: [string, string][] = [
  ["name", "Austin flips"],
  ["strategy", NO_STRATEGY],
  ["geographyMode", "ZIPS"],
  ["geography", "78704, 78745"],
  ["priceMin", ""],
  ["priceMax", "300000"],
  ["propertyTypes.mode", ANY],
  ["conditionsAccepted.mode", ONLY],
  ["conditionsAccepted", "FAIR"],
  ["programsAccepted.mode", ANY],
  ["acceptsListed", LISTED],
];

describe("readForm", () => {
  it("sends blank numbers and lists left at any as null", () => {
    const box = readForm(form(base), "ACTIVE");
    expect(box).toMatchObject({
      strategy: null,
      geography: ["78704", "78745"],
      priceMin: null,
      priceMax: 300_000,
      propertyTypes: null,
      conditionsAccepted: ["FAIR"],
      acceptsListed: true,
    });
  });

  it("sends only-these with nothing checked as an empty list, for the api to refuse", () => {
    const onlyNothing = base.map(([name, value]): [string, string] =>
      name === "propertyTypes.mode" ? [name, ONLY] : [name, value],
    );
    const box = readForm(form(onlyNothing), "ACTIVE");
    expect(box.propertyTypes).toEqual([]);
  });
});
