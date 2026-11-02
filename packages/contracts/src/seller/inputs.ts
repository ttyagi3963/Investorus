// The seller details an agent types into a draft package (create) or changes later (update),
// checked with Zod against the data-model rules. Errors name the field, so the form can point at it.
import { z } from "zod";

/** E.164: a plus sign, then up to 15 digits (for example +15551234567). */
const E164 = /^\+[1-9]\d{1,14}$/;

const fullName = z.string().trim().min(1, "Enter the seller's name");
const email = z.email({ message: "Enter a valid email, for example name@example.com" });
const phone = z.string().regex(E164, "Use international format, for example +15551234567");

export const createSellerInputSchema = z
  .object({ fullName, email: email.optional(), phone: phone.optional() })
  .refine((seller) => seller.email !== undefined || seller.phone !== undefined, {
    message: "Enter an email or a phone number",
    path: ["email"],
  });
export type CreateSellerInput = z.input<typeof createSellerInputSchema>;

/**
 * A field left out stays unchanged; `null` clears email or phone (constitution V). Whether the
 * seller still has an email or a phone depends on the stored row, so the service checks it on the
 * merged result, backed by the database CHECK.
 */
export const updateSellerInputSchema = z.object({
  fullName: fullName.optional(),
  email: email.nullable().optional(),
  phone: phone.nullable().optional(),
});
export type UpdateSellerInput = z.input<typeof updateSellerInputSchema>;
