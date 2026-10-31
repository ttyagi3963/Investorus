// The one place outside data enters for users: the create input, checked with Zod against the
// data-model rules. Only the seed creates users today (no sign-up, no user update).
import { z } from "zod";

const createUserBaseSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40),
  password: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
});

/** Each role carries exactly its own link. The service hashes `password`; it is never stored. */
export const createUserInputSchema = z.discriminatedUnion("role", [
  createUserBaseSchema.extend({ role: z.literal("AGENT"), agentId: z.string() }),
  createUserBaseSchema.extend({ role: z.literal("OPS") }),
]);
export type CreateUserInput = z.input<typeof createUserInputSchema>;
