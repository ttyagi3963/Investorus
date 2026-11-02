// Checks for number fields people fill in (T424): each field has one plain message that covers every
// way it can fail (left blank, a word typed, a fraction, a limit crossed), so the form never shows
// Zod's built-in wording such as "Too small: expected number to be >=100".
import { z } from "zod";

/** A whole number from min up to max (no upper limit when max is left out). */
export function wholeNumber(message: string, min: number, max?: number) {
  const n = z.number({ message }).int(message).min(min, message);
  return max === undefined ? n : n.max(max, message);
}

/** A price in whole dollars above $0. */
export const price = () => wholeNumber("Enter a price in whole dollars above $0", 1);

/** An amount in whole dollars that may be $0, such as a repair estimate or earnest money. */
export const dollars = () => wholeNumber("Enter whole dollars, 0 or more", 0);
