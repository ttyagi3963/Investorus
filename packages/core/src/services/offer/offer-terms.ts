// Offer terms shared by the investor's offers and the agent's counters (T296, T309): the date rules
// Zod cannot check without the clock, and an offer's terms on their own, as a revision keeps them.
import { ValidationError, type FieldError } from "@clever/contracts/common";
import type { Offer, OfferTerms } from "@clever/contracts/offer";
import { earliestToday } from "../../providers/clock/earliest-today.js";

/**
 * The closing date is not in the past (today anywhere counts, T387) and the expiry is ahead; each
 * failure names its field.
 */
export function checkOfferDates(
  input: Omit<OfferTerms, "expiresAt"> & { expiresAt: string },
  now: Date,
  prefix = "",
): OfferTerms {
  const errors: FieldError[] = [];
  if (input.closingDate < earliestToday(now)) {
    errors.push({ field: `${prefix}closingDate`, message: "Cannot be in the past" });
  }
  const expiresAt = new Date(input.expiresAt);
  if (expiresAt <= now)
    errors.push({ field: `${prefix}expiresAt`, message: "Must be in the future" });
  if (errors.length > 0) throw new ValidationError("Some fields are invalid", errors);
  return { ...input, expiresAt };
}

export const termsOf = (offer: Offer): OfferTerms => ({
  price: offer.price,
  paymentType: offer.paymentType,
  closingDate: offer.closingDate,
  earnestMoney: offer.earnestMoney,
  contingencies: offer.contingencies,
  feesAndConcessions: offer.feesAndConcessions,
  expiresAt: offer.expiresAt,
});
