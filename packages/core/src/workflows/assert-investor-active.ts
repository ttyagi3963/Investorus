// Refuses to make a deactivated investor the buyer (T370; spec edge case "investor deactivated"):
// operations deactivated them, they can no longer sign in, and accepting would reveal the seller's
// details to them. Their offer stays visible to the agent, flagged, rather than silently removed.
import { BusinessRuleError } from "@clever/contracts/common";
import type { UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";

export async function assertInvestorActive(
  repos: UnitOfWorkRepositories,
  investorId: string,
): Promise<void> {
  if ((await repos.investors.findInactive([investorId])).size > 0) {
    throw new BusinessRuleError(
      "This investor has been deactivated, so their offer cannot be accepted",
      "INVESTOR_INACTIVE",
    );
  }
}
