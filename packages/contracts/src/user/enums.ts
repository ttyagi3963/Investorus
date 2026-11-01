// The login roles as one `as const` list (constitution V), matching the Prisma `Role` enum.
export const ROLES = ["AGENT", "INVESTOR", "OPS"] as const;
export type Role = (typeof ROLES)[number];
