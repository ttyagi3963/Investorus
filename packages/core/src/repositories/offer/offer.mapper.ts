// Maps a database Offer row to the domain type and back, the only place the row type appears
// (constitution IV): the closing date is a DATE column and a `YYYY-MM-DD` string in the domain.
import type { Offer, OfferTerms } from "@clever/contracts/offer";
import type { Offer as OfferRow } from "../../generated/prisma/client.js";

export function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    packageId: row.packageId,
    investorId: row.investorId,
    round: row.round,
    status: row.status,
    currentRevision: row.currentRevision,
    price: row.price,
    paymentType: row.paymentType,
    closingDate: row.closingDate.toISOString().slice(0, 10),
    earnestMoney: row.earnestMoney,
    contingencies: row.contingencies ?? [],
    feesAndConcessions: row.feesAndConcessions,
    expiresAt: row.expiresAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const toOfferColumns = (terms: OfferTerms) => ({
  ...terms,
  closingDate: new Date(`${terms.closingDate}T00:00:00Z`),
});

/** What a revision row keeps: the terms as JSON. */
export const toRevisionTerms = (terms: OfferTerms) => ({
  ...terms,
  expiresAt: terms.expiresAt.toISOString(),
});
