// The demo's Los Angeles listings market (T409): made-up addresses and sellers in real LA ZIP codes,
// with facts that fit each home's style. Prices sit around each ZIP's typical home value, the Zillow
// Home Value Index (all homes, middle tier, smoothed and seasonally adjusted) for 2026-09-30, from
// Zillow Research's public ZIP file: values only, no listing data. listings.ts seeds them.
import type { OfferProgram } from "@clever/contracts/listing-package";
import type { Contingency, PaymentType } from "@clever/contracts/offer";
import type { NewProperty } from "../../repositories/property/IPropertyRepository.js";

type Facts = Pick<
  NewProperty,
  | "propertyType"
  | "beds"
  | "baths"
  | "sqft"
  | "lotSqft"
  | "units"
  | "yearBuilt"
  | "condition"
  | "repairEstimate"
>;

/** An offer by the investor's email; dates are days from the seed run. */
export type SeedOffer = {
  investor: string;
  price: number;
  paymentType: PaymentType;
  contingencies: Contingency[];
  closingInDays: number;
  earnestMoney: number;
  feesAndConcessions: number;
  expiresInDays: number;
};

export type SeedListing = {
  agent: "avery@example.com" | "blake@example.com";
  seller: { fullName: string; email: string; phone: string };
  streetLine: string;
  zip: string;
  facts: Facts;
  priceMin: number;
  priceMax: number;
  /** Days from the seed run; null leaves the draft without a closing window. */
  closingWindow: [number, number] | null;
  currentlyListed: boolean | null;
  programs: OfferProgram[];
  /** Published with offers due this many days out; null stays a draft. */
  deadlineInDays: number | null;
  offers?: SeedOffer[];
  /** The seller accepts this investor's offer and the deal goes under contract. */
  acceptedInvestor?: string;
};

const home = (facts: Partial<Facts> & Pick<Facts, "propertyType">): Facts => ({
  beds: null,
  baths: null,
  sqft: null,
  lotSqft: null,
  units: null,
  yearBuilt: null,
  condition: null,
  repairEstimate: null,
  ...facts,
});

/** Blake's deal demo (T314): four offers that differ in price, payment, terms, and closing date. */
export const DEAL_DEMO: SeedListing = {
  agent: "blake@example.com",
  seller: {
    fullName: "Marisol Ortega",
    email: "marisol.ortega@example.net",
    phone: "+13235550142",
  },
  streetLine: "2417 Corvina St",
  zip: "90016",
  // A 1922 craftsman bungalow; West Adams' typical value is about $900k.
  facts: home({
    propertyType: "SINGLE_FAMILY",
    beds: 3,
    baths: 2,
    sqft: 1_480,
    lotSqft: 5_200,
    yearBuilt: 1922,
    condition: "FAIR",
    repairEstimate: 85_000,
  }),
  priceMin: 815_000,
  priceMax: 875_000,
  closingWindow: [14, 60],
  currentlyListed: false,
  programs: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
  deadlineInDays: 3,
  offers: [
    {
      investor: "summit@example.com",
      price: 845_000,
      paymentType: "CASH",
      contingencies: ["INSPECTION"],
      closingInDays: 30,
      earnestMoney: 25_000,
      feesAndConcessions: 0,
      expiresInDays: 5,
    },
    {
      investor: "harbor@example.com",
      price: 870_000,
      paymentType: "FINANCED",
      contingencies: ["FINANCING", "APPRAISAL", "INSPECTION"],
      closingInDays: 45,
      earnestMoney: 30_000,
      feesAndConcessions: 20_000,
      expiresInDays: 6,
    },
    {
      investor: "cobalt@example.com",
      price: 825_000,
      paymentType: "CASH",
      contingencies: [],
      closingInDays: 14,
      earnestMoney: 40_000,
      feesAndConcessions: 0,
      expiresInDays: 7,
    },
    {
      investor: "dune@example.com",
      price: 855_000,
      paymentType: "CASH",
      contingencies: ["INSPECTION", "TITLE"],
      closingInDays: 21,
      earnestMoney: 25_000,
      feesAndConcessions: 8_000,
      expiresInDays: 4,
    },
  ],
};

export const LISTINGS: SeedListing[] = [
  DEAL_DEMO,
  {
    agent: "blake@example.com",
    seller: { fullName: "Desmond Hale", email: "desmond.hale@example.net", phone: "+13105550117" },
    streetLine: "1185 Halvern St",
    zip: "90301",
    // A 1949 post-war bungalow, under contract; Inglewood's typical value is about $680k.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 2,
      baths: 1,
      sqft: 1_050,
      lotSqft: 5_000,
      yearBuilt: 1949,
      condition: "FAIR",
      repairEstimate: 45_000,
    }),
    priceMin: 640_000,
    priceMax: 690_000,
    closingWindow: [10, 45],
    currentlyListed: false,
    programs: ["CASH_OFFER"],
    deadlineInDays: 2,
    offers: [
      {
        investor: "cobalt@example.com",
        price: 675_000,
        paymentType: "CASH",
        contingencies: ["INSPECTION"],
        closingInDays: 21,
        earnestMoney: 20_000,
        feesAndConcessions: 0,
        expiresInDays: 6,
      },
      {
        investor: "summit@example.com",
        price: 660_000,
        paymentType: "CASH",
        contingencies: [],
        closingInDays: 14,
        earnestMoney: 15_000,
        feesAndConcessions: 0,
        expiresInDays: 6,
      },
    ],
    acceptedInvestor: "cobalt@example.com",
  },
  {
    agent: "blake@example.com",
    seller: { fullName: "Priya Nair", email: "priya.nair@example.net", phone: "+18185550123" },
    streetLine: "6620 Delmora Ave",
    zip: "91406",
    // A 1962 fourplex of two-bedroom units; Van Nuys' typical home value is about $840k.
    facts: home({
      propertyType: "MULTI_FAMILY",
      beds: 8,
      baths: 4,
      sqft: 3_600,
      lotSqft: 7_500,
      units: 4,
      yearBuilt: 1962,
      condition: "GOOD",
      repairEstimate: 20_000,
    }),
    priceMin: 1_450_000,
    priceMax: 1_550_000,
    closingWindow: [21, 75],
    currentlyListed: false,
    programs: ["CASH_OFFER", "SEVEN_DAY_SOLD"],
    deadlineInDays: 5,
    offers: [
      {
        investor: "cobalt@example.com",
        price: 1_490_000,
        paymentType: "FINANCED",
        contingencies: ["FINANCING", "APPRAISAL"],
        closingInDays: 45,
        earnestMoney: 45_000,
        feesAndConcessions: 15_000,
        expiresInDays: 6,
      },
    ],
  },
  {
    agent: "avery@example.com",
    seller: {
      fullName: "Walter Brandt",
      email: "walter.brandt@example.net",
      phone: "+13235550131",
    },
    streetLine: "5318 Wren Hollow Ave",
    zip: "90042",
    // A 1912 craftsman needing work; Highland Park's typical value is about $965k.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 2,
      baths: 1,
      sqft: 1_120,
      lotSqft: 5_600,
      yearBuilt: 1912,
      condition: "POOR",
      repairEstimate: 140_000,
    }),
    priceMin: 760_000,
    priceMax: 820_000,
    closingWindow: [7, 45],
    currentlyListed: false,
    programs: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
    deadlineInDays: 4,
    offers: [
      {
        investor: "summit@example.com",
        price: 790_000,
        paymentType: "CASH",
        contingencies: ["INSPECTION"],
        closingInDays: 21,
        earnestMoney: 20_000,
        feesAndConcessions: 0,
        expiresInDays: 5,
      },
    ],
  },
  {
    agent: "avery@example.com",
    seller: { fullName: "Lena Okafor", email: "lena.okafor@example.net", phone: "+13235550152" },
    streetLine: "3841 Saffron Hill Rd",
    zip: "90065",
    // A 1987 hillside contemporary; Glassell Park's typical value is about $1.09M.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 3,
      baths: 2.5,
      sqft: 1_850,
      lotSqft: 6_800,
      yearBuilt: 1987,
      condition: "GOOD",
      repairEstimate: 15_000,
    }),
    priceMin: 1_150_000,
    priceMax: 1_250_000,
    closingWindow: [21, 60],
    currentlyListed: true,
    programs: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
    deadlineInDays: 6,
  },
  {
    agent: "avery@example.com",
    seller: { fullName: "Tomás Villalobos", email: "tomas.v@example.net", phone: "+12135550164" },
    streetLine: "1529 Marisol Pl",
    zip: "90026",
    // A 1928 Spanish revival; Echo Park's typical value is about $1.14M.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 3,
      baths: 2,
      sqft: 1_640,
      lotSqft: 5_900,
      yearBuilt: 1928,
      condition: "FAIR",
      repairEstimate: 60_000,
    }),
    priceMin: 1_080_000,
    priceMax: 1_150_000,
    closingWindow: [14, 60],
    currentlyListed: false,
    programs: ["CASH_OFFER"],
    deadlineInDays: 5,
    offers: [
      {
        investor: "harbor@example.com",
        price: 1_110_000,
        paymentType: "FINANCED",
        contingencies: ["FINANCING", "INSPECTION"],
        closingInDays: 40,
        earnestMoney: 35_000,
        feesAndConcessions: 10_000,
        expiresInDays: 6,
      },
    ],
  },
  {
    agent: "avery@example.com",
    seller: { fullName: "Grace Lindqvist", email: "grace.l@example.net", phone: "+13105550175" },
    streetLine: "11942 Brightwater Ln Unit 204",
    zip: "90066",
    // A 1974 two-bedroom condo; Mar Vista's condos sell well below its $1.69M typical home value.
    facts: home({
      propertyType: "CONDO",
      beds: 2,
      baths: 2,
      sqft: 1_080,
      yearBuilt: 1974,
      condition: "GOOD",
      repairEstimate: 10_000,
    }),
    priceMin: 780_000,
    priceMax: 840_000,
    closingWindow: [14, 50],
    currentlyListed: false,
    programs: ["CASH_OFFER", "SEVEN_DAY_SOLD"],
    deadlineInDays: 4,
  },
  {
    agent: "blake@example.com",
    seller: {
      fullName: "Hannah Mercer",
      email: "hannah.mercer@example.net",
      phone: "+13235550186",
    },
    streetLine: "3207 Alderwood Ct",
    zip: "90039",
    // A 2006 townhome; Atwater Village's typical value is about $1.33M.
    facts: home({
      propertyType: "TOWNHOME",
      beds: 3,
      baths: 2.5,
      sqft: 1_620,
      lotSqft: 1_800,
      yearBuilt: 2006,
      condition: "EXCELLENT",
      repairEstimate: 0,
    }),
    priceMin: 1_090_000,
    priceMax: 1_150_000,
    closingWindow: [30, 75],
    currentlyListed: true,
    programs: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
    deadlineInDays: 7,
  },
  {
    agent: "avery@example.com",
    seller: {
      fullName: "Ruben Castillo",
      email: "ruben.castillo@example.net",
      phone: "+13105550197",
    },
    streetLine: "718 Vireo Ct",
    zip: "90291",
    // A 1948 beach bungalow on a small lot; Venice's typical value is about $1.91M.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 2,
      baths: 1,
      sqft: 1_050,
      lotSqft: 2_850,
      yearBuilt: 1948,
      condition: "FAIR",
      repairEstimate: 90_000,
    }),
    priceMin: 1_750_000,
    priceMax: 1_900_000,
    closingWindow: [21, 60],
    currentlyListed: false,
    programs: ["CASH_OFFER"],
    deadlineInDays: 6,
  },
  {
    agent: "blake@example.com",
    seller: { fullName: "Celeste Moreau", email: "celeste.m@example.net", phone: "+13235550108" },
    streetLine: "2290 Palomar Vista Dr",
    zip: "90027",
    // A 1958 mid-century modern in the hills; Los Feliz's typical value is about $1.77M.
    facts: home({
      propertyType: "SINGLE_FAMILY",
      beds: 4,
      baths: 3,
      sqft: 2_650,
      lotSqft: 8_900,
      yearBuilt: 1958,
      condition: "GOOD",
      repairEstimate: 35_000,
    }),
    priceMin: 2_450_000,
    priceMax: 2_650_000,
    closingWindow: [30, 90],
    currentlyListed: false,
    programs: ["CASH_OFFER", "CASH_WITH_UPSIDE"],
    deadlineInDays: 7,
  },
  {
    agent: "avery@example.com",
    seller: {
      fullName: "Felix Andrade",
      email: "felix.andrade@example.net",
      phone: "+18185550119",
    },
    streetLine: "15520 Cobblerock Way",
    zip: "91406",
    // An empty single-family lot: no seeded buy box takes land, so nobody is matched.
    facts: home({ propertyType: "LAND", lotSqft: 7_200 }),
    priceMin: 520_000,
    priceMax: 575_000,
    closingWindow: [14, 90],
    currentlyListed: false,
    programs: ["CASH_OFFER"],
    deadlineInDays: 7,
  },
  {
    agent: "avery@example.com",
    seller: { fullName: "Naomi Feld", email: "naomi.feld@example.net", phone: "+13235550129" },
    streetLine: "4416 Tamsen St",
    zip: "90019",
    // A 1926 Spanish duplex, still a draft: no closing window, program, or photo yet.
    facts: home({
      propertyType: "MULTI_FAMILY",
      beds: 4,
      baths: 2,
      sqft: 2_240,
      lotSqft: 6_100,
      units: 2,
      yearBuilt: 1926,
      condition: "FAIR",
      repairEstimate: 75_000,
    }),
    priceMin: 1_250_000,
    priceMax: 1_350_000,
    closingWindow: null,
    currentlyListed: null,
    programs: [],
    deadlineInDays: null,
  },
  {
    agent: "blake@example.com",
    seller: {
      fullName: "Oscar Lindgren",
      email: "oscar.lindgren@example.net",
      phone: "+13105550130",
    },
    streetLine: "3522 Ostrander Pl Unit 3",
    zip: "90034",
    // A 1989 condo, a draft that needs only its photos; Palms' typical value is about $1.41M.
    facts: home({
      propertyType: "CONDO",
      beds: 2,
      baths: 2,
      sqft: 1_150,
      yearBuilt: 1989,
      condition: "GOOD",
      repairEstimate: 5_000,
    }),
    priceMin: 850_000,
    priceMax: 900_000,
    closingWindow: [21, 60],
    currentlyListed: false,
    programs: ["CASH_OFFER"],
    deadlineInDays: null,
  },
];
