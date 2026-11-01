// Maps a database User row to the `User` domain type, the only place the row type appears
// (constitution IV). The role CHECK guarantees the role and link agree; a row that breaks it fails.
import type { User } from "@clever/contracts/user";
import type { User as UserRow } from "../../generated/prisma/client.js";

export function toUser(row: UserRow): User {
  const base = {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.role === "AGENT" && row.agentId !== null)
    return { ...base, role: "AGENT", agentId: row.agentId };
  if (row.role === "OPS" && row.agentId === null) return { ...base, role: "OPS", agentId: null };
  throw new Error(`User ${row.id} breaks the role link rule`);
}
