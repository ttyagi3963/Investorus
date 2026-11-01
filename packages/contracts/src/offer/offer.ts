// The Offer the app passes around, shaped from the Prisma `Offer` model (T281), with the closing
// date as `YYYY-MM-DD`, and the view both the investor and the package's agent see.

export const OFFER_STATUSES = ["ACTIVE", "DECLINED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const PAYMENT_TYPES = ["CASH", "FINANCED"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const CONTINGENCIES = [
  "INSPECTION",
  "FINANCING",
  "APPRAISAL",
  "TITLE",
  "SALE_OF_HOME",
] as const;
export type Contingency = (typeof CONTINGENCIES)[number];

/** The terms an offer carries; each revision stores a copy. */
export type OfferTerms = {
  price: number;
  paymentType: PaymentType;
  closingDate: string;
  earnestMoney: number;
  contingencies: Contingency[];
  feesAndConcessions: number;
  expiresAt: Date;
};

export type Offer = OfferTerms & {
  id: string;
  packageId: string;
  investorId: string;
  round: number;
  status: OfferStatus;
  currentRevision: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type OfferView = Omit<OfferTerms, "expiresAt"> & {
  id: string;
  packageId: string;
  status: OfferStatus;
  revision: number;
  version: number;
  expiresAt: string;
  updatedAt: string;
};

export function toOfferView(offer: Offer): OfferView {
  return {
    id: offer.id,
    packageId: offer.packageId,
    status: offer.status,
    revision: offer.currentRevision,
    version: offer.version,
    price: offer.price,
    paymentType: offer.paymentType,
    closingDate: offer.closingDate,
    earnestMoney: offer.earnestMoney,
    contingencies: offer.contingencies,
    feesAndConcessions: offer.feesAndConcessions,
    expiresAt: offer.expiresAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}
