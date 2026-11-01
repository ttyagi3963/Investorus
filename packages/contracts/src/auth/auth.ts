// The auth contracts (T020): the sign-in input, the actor (who is signed in, as the session token
// carries it), and the session response. The actor is checked with Zod when a token is read,
// because a token is outside data until verified.
import { z } from "zod";
import type { UserView } from "../user/views.js";

/** POST /sessions. The email is matched as stored: trimmed and lowercased. */
export const createSessionSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

/** Who is calling. Like `User`, each role carries exactly its own link. */
export const actorSchema = z.discriminatedUnion("role", [
  z.object({ userId: z.string(), role: z.literal("AGENT"), agentId: z.string() }),
  z.object({ userId: z.string(), role: z.literal("INVESTOR"), investorId: z.string() }),
  z.object({ userId: z.string(), role: z.literal("OPS"), agentId: z.null() }),
]);
export type Actor = z.infer<typeof actorSchema>;

/** The answer to POST /sessions. GET /me returns the `user` part alone. */
export type SessionResponse = { token: string; user: UserView };
