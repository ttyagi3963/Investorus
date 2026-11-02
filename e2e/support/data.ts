// The data each spec creates for itself (T411): a unique tag for names and street lines, a ZIP the
// static geo lookup knows, a publishable package, an empty buy box that one ZIP and price narrow, an
// offer's terms, and a real JPEG. The specs never rely on seeded listings or buy boxes, only on the
// demo accounts, so a new seed cannot break them.
import { randomBytes } from "node:crypto";
import type { BuyBoxInput } from "@clever/contracts/buy-box";
import type { CreateListingPackageInput } from "@clever/contracts/listing-package";
import type { CreateOfferInput } from "@clever/contracts/offer";

/** A ZIP in packages/core/src/providers/geo/zips.ts (Austin, TX). */
export const ZIP = "78704";

/** Short and unique per call, so a rerun on the same database never collides with an earlier run. */
export const uniqueTag = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

/** A street line unique to this test; the api refuses a second open package at one address. */
export const street = (tag: string) =>
  `${100 + (parseInt(tag.slice(-4), 16) % 9000)} E2E ${tag} Way`;

const DAY = 86_400_000;
/** A `YYYY-MM-DD` date this many days from today (UTC). */
export const isoDate = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

/** Everything publishing needs except the photo, at a price the test chooses. */
export function packageInput(tag: string, price: number): CreateListingPackageInput {
  return {
    seller: {
      fullName: `Seller ${tag}`,
      email: `seller-${tag}@example.com`,
      phone: "+15125550142",
    },
    property: {
      streetLine: street(tag),
      zip: ZIP,
      propertyType: "SINGLE_FAMILY",
      beds: 3,
      baths: 2,
      sqft: 1_400,
      yearBuilt: 1978,
      condition: "FAIR",
      repairEstimate: 20_000,
    },
    priceExpectationMin: price - 10_000,
    priceExpectationMax: price,
    closingWindowStart: isoDate(14),
    closingWindowEnd: isoDate(60),
    currentlyListed: false,
    eligiblePrograms: ["CASH_OFFER"],
  };
}

/** A buy box that takes any home in ZIP whose top price is within the range. */
export function buyBoxInput(name: string, priceMin: number, priceMax: number): BuyBoxInput {
  return {
    name,
    strategy: null,
    status: "ACTIVE",
    geographyMode: "ZIPS",
    geography: [ZIP],
    propertyTypes: null,
    priceMin,
    priceMax,
    yearBuiltMin: null,
    yearBuiltMax: null,
    bedsMin: null,
    bedsMax: null,
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    unitsMin: null,
    unitsMax: null,
    conditionsAccepted: null,
    repairMax: null,
    closeWithinDays: null,
    acceptsListed: true,
    programsAccepted: null,
  };
}

/** Cash, no contingencies, closing in a month, open for three days. */
export function offerTerms(price: number): CreateOfferInput {
  return {
    price,
    paymentType: "CASH",
    closingDate: isoDate(30),
    earnestMoney: 5_000,
    contingencies: [],
    feesAndConcessions: 0,
    expiresAt: new Date(Date.now() + 3 * DAY).toISOString(),
  };
}

/** An 8×6 JPEG made by Chromium's canvas: small, but a real image the browser decodes. */
export const JPEG = {
  name: "front.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAGAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCaAE5//9k=",
    "base64",
  ),
};
