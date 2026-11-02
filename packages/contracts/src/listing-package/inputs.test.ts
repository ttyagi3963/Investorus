// Guards the wording of the package form's field errors (T424): every field a person fills in says
// what to enter in plain words, never Zod's built-in "Too small: expected number to be >=100" or
// "Invalid option: expected one of ...", because the form shows these messages as they are.
import { describe, expect, it } from "vitest";
import { createListingPackageInputSchema } from "./inputs.js";

describe("package form errors", () => {
  it("say what to enter, field by field", () => {
    const result = createListingPackageInputSchema.safeParse({
      seller: { fullName: " ", email: "not-an-email" },
      property: {
        streetLine: "",
        zip: "90026",
        neighborhood: "",
        propertyType: undefined,
        beds: 2.5,
        baths: 2.3,
        sqft: 50,
        lotSqft: 0,
        yearBuilt: Number.NaN,
        condition: "SHINY",
        repairEstimate: -5,
      },
      priceExpectationMin: 0,
      priceExpectationMax: 400_000.5,
    });

    const messages = Object.fromEntries(
      result.error!.issues.map((issue) => [issue.path.join("."), issue.message]),
    );
    expect(messages).toEqual({
      "seller.fullName": "Enter the seller's name",
      "seller.email": "Enter a valid email, for example name@example.com",
      "property.streetLine": "Enter the street address",
      "property.neighborhood": "Enter the neighborhood",
      "property.propertyType": "Choose a property type",
      "property.beds": "Enter a whole number from 0 to 20",
      "property.baths": "Use whole or half baths from 0 to 20, for example 2.5",
      "property.sqft": "Enter 100 to 20,000 square feet",
      "property.lotSqft": "Enter a lot size above 0",
      "property.yearBuilt": "Enter a year from 1800 on",
      "property.condition": "Choose a condition",
      "property.repairEstimate": "Enter whole dollars, 0 or more",
      priceExpectationMin: "Enter a price in whole dollars above $0",
      priceExpectationMax: "Enter a price in whole dollars above $0",
    });
  });
});
