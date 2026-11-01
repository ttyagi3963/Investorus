// The User the app passes around, shaped from the Prisma `User` model minus `passwordHash`, so
// the hash cannot leak into tokens, logs, or responses. A plain type: users come from our own
// database, which enforces the rules (unique email, the role CHECK).

type UserBase = {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Each role carries exactly its own link, as the database CHECK requires. */
export type User =
  (UserBase & { role: "AGENT"; agentId: string }) | (UserBase & { role: "OPS"; agentId: null });

/** A user plus the stored bcrypt hash. Only the user repository returns it, for sign-in. */
export type UserCredentials = { user: User; passwordHash: string };
