// The agent's view of how matching went (T343; design 04): from the latest MATCHING_COMPLETED entry of
// the package's round, how many eligible buy boxes were weighed and the four criteria the others
// failed most often. Counts only, so no investor or box can be identified (XII). An entry written
// before these counts existed gives no summary.
import { CRITERIA, CRITERION_KEYS, type CriterionKey } from "@clever/contracts/buy-box";
import type { MatchSummary } from "@clever/contracts/listing-package";
import { z } from "zod";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

const TOP_REASONS = 4;

const countsSchema = z.object({
  round: z.number(),
  evaluated: z.number().int().min(0),
  exclusions: z.record(z.string(), z.number().int().min(0)),
});

export async function matchSummaryOf(
  repos: Pick<UnitOfWorkRepositories, "audit">,
  packageId: string,
  round: number,
): Promise<MatchSummary | null> {
  const entries = await repos.audit.listForEntity("ListingPackage", packageId);
  const latest = entries.findLast(
    (e) => e.action === "MATCHING_COMPLETED" && (e.details as { round?: unknown }).round === round,
  );
  const parsed = countsSchema.safeParse(latest?.details);
  if (!parsed.success) return null;
  const { evaluated, exclusions } = parsed.data;
  const reasons = CRITERION_KEYS.flatMap((key: CriterionKey) => {
    const count = exclusions[key] ?? 0;
    return count > 0 ? [{ key, label: CRITERIA[key].label, count }] : [];
  })
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_REASONS);
  return { evaluated, reasons };
}
