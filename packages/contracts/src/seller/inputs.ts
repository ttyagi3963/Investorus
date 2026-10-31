// The seller details an agent types into a draft package, checked with Zod against the data-model
// rules. Errors name the field, so the form can point at it.
import { z } from "zod";

/** E.164: a plus sign, then up to 15 digits (for example +15551234567). */
const E164 = /^\+[1-9]\d{1,14}$/;

export const createSellerInputSchema = z
  .object({
    fullName: z.string().trim().min(1),
    email: z.email().optional(),
    phone: z.string().regex(E164, "Use international format, for example +15551234567").optional(),
  })
  .refine((seller) => seller.email !== undefined || seller.phone !== undefined, {
    message: "Enter an email or a phone number",
    path: ["email"],
  });
export type CreateSellerInput = z.input<typeof createSellerInputSchema>;
