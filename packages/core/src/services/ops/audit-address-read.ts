// Records that an operations user read listing addresses (T341; XII, XX.1): the console shows each
// package's street line, which only its agent otherwise sees, so every read is audited with who read
// it, which view, and which packages (IDs only).
import type { Actor } from "@clever/contracts/auth";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

export function auditAddressRead(
  repos: Pick<UnitOfWorkRepositories, "audit">,
  actor: Actor,
  view: "packages" | "trace" | "crm-comparison",
  packageIds: string[],
) {
  return repos.audit.append({
    actorType: "USER",
    actorId: actor.userId,
    action: "PII_ACCESSED",
    entityType: view === "trace" ? "ListingPackage" : "OpsConsole",
    entityId: view === "trace" ? (packageIds[0] ?? "none") : view,
    outcome: "SUCCESS",
    details: { purpose: "OPS_CONSOLE", view, packageIds },
  });
}
