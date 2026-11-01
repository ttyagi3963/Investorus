// A published package in an in-memory unit of work, for the tests of what happens after publish
// (T295–T297): the demo agent, investor logins, and a clock the test can move.
import type { Actor } from "@clever/contracts/auth";
import type { CreateListingPackageInput } from "@clever/contracts/listing-package";
import type { CreateOfferInput } from "@clever/contracts/offer";
import type { UserCredentials } from "@clever/contracts/user";
import { StaticGeoProviderImpl } from "../../src/providers/geo/StaticGeoProviderImpl.js";
import { createAddressHasher } from "../../src/providers/pii-cipher/address-hasher.js";
import { ListingPackageService } from "../../src/services/listing-package/ListingPackageService.js";
import { PublicationWorkflow } from "../../src/workflows/publication/PublicationWorkflow.js";
import { InMemoryUnitOfWork } from "../doubles/InMemoryRepositories.js";

export const START = new Date("2026-11-01T12:00:00Z");
export const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
export const blake: Actor = { userId: "user-b", role: "AGENT", agentId: "agent-b" };
export const investor = (name: string): Actor => ({
  userId: `user-${name}`,
  role: "INVESTOR",
  investorId: `investor-${name}`,
});

const login = (name: string) =>
  ({
    user: {
      id: `user-${name}`,
      email: `${name}@example.com`,
      role: "INVESTOR",
      displayName: name,
      agentId: null,
      investorId: `investor-${name}`,
      active: true,
    },
    passwordHash: "hash",
  }) as UserCredentials;

export const listing = (streetLine = "12 Elm St"): CreateListingPackageInput => ({
  seller: { fullName: "Maria Lopez", phone: "+15551234567" },
  property: {
    streetLine,
    zip: "78704",
    propertyType: "SINGLE_FAMILY",
    beds: 3,
    baths: 2,
    sqft: 1_600,
    yearBuilt: 1985,
    condition: "FAIR",
  },
  priceExpectationMin: 250_000,
  priceExpectationMax: 300_000,
  closingWindowStart: "2026-11-20",
  closingWindowEnd: "2026-12-15",
  currentlyListed: false,
  eligiblePrograms: ["CASH_OFFER"],
});

export const offer = (change: Partial<CreateOfferInput> = {}): CreateOfferInput => ({
  price: 280_000,
  paymentType: "CASH",
  closingDate: "2026-12-01",
  earnestMoney: 5_000,
  contingencies: ["INSPECTION"],
  feesAndConcessions: 0,
  expiresAt: "2026-11-03T12:00:00Z",
  ...change,
});

export function world() {
  const uow = new InMemoryUnitOfWork(["summit", "harbor"].map(login));
  const clock = { at: START, now: () => clock.at };
  const packages = new ListingPackageService(uow, {
    geo: new StaticGeoProviderImpl(),
    addressHash: createAddressHasher("test-hash-key"),
    clock,
  });
  const publication = new PublicationWorkflow(uow, { clock });

  /** Publishes a package and matches it to each named investor, as the matching job would. */
  const publish = async (streetLine = "12 Elm St", matchedTo: string[] = ["summit"]) => {
    const created = await packages.create(avery, listing(streetLine));
    await uow.repos.photos.add({
      packageId: created.package.id,
      storageKey: `photos/${created.package.id}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 1_000,
      position: 0,
    });
    const { package: pkg } = await publication.publish(avery, created.package.id, { version: 1 });
    for (const name of matchedTo) {
      await uow.repos.matches.upsert({
        packageId: pkg.id,
        investorId: `investor-${name}`,
        round: 1,
        matchedBuyBoxIds: [`${name}-box`],
        trigger: "PUBLISH",
      });
    }
    return pkg;
  };
  return { uow, clock, packages, publication, publish };
}
