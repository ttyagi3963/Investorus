// Each role's home and area (T358): where sign-in lands, and where the proxy sends a user who opens
// another role's pages. One map, so the two cannot disagree.
export const ROLE_HOME: Record<string, string> = {
  AGENT: "/agent",
  INVESTOR: "/investor",
  OPS: "/ops/packages",
};

/** The role whose pages a path belongs to, or null for a public page. */
export function areaRole(pathname: string): string | null {
  if (pathname === "/agent" || pathname.startsWith("/agent/")) return "AGENT";
  if (pathname === "/investor" || pathname.startsWith("/investor/")) return "INVESTOR";
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return "OPS";
  return null;
}
