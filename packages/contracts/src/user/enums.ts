// The login roles as one `as const` list (constitution V), matching the Prisma `Role` enum.
// INVESTOR is added with the Investor table in Sprint 2.
export const ROLES = ["AGENT", "OPS"] as const;
export type Role = (typeof ROLES)[number];
