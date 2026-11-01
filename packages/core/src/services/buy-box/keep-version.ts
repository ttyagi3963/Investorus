// What every buy box save does after writing the box (T321, T322; FR-023), whether an investor
// saved it or the legacy import did: keep the version as a snapshot and, when the box is ACTIVE and
// its criteria or status changed, queue MATCH_BUY_BOX for that version, in the same change.
import { CRITERIA, CRITERION_KEYS, type BuyBox } from "@clever/contracts/buy-box";
import type { MatchBuyBoxPayload } from "@clever/contracts/jobs";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** Every field a criterion owns, from the registry, so a new criterion is compared too. */
const CRITERION_FIELDS = CRITERION_KEYS.flatMap((key) => Object.keys(CRITERIA[key].fields));

/** The box's criteria and status, comparable between two versions. */
export function matchingTermsOf(box: BuyBox): string {
  const values = Object.fromEntries(
    CRITERION_FIELDS.map((field) => [field, box[field as keyof BuyBox]]),
  );
  return JSON.stringify({ ...values, geography: [...box.geography].sort(), status: box.status });
}

/** Returns whether matching was queued. `createdBy` is null for the system (the import). */
export async function keepVersionAndMatch(
  repos: UnitOfWorkRepositories,
  box: BuyBox,
  { changed, createdBy }: { changed: boolean; createdBy: string | null },
): Promise<boolean> {
  await repos.buyBoxes.appendVersion(box, createdBy);
  if (!changed || box.status !== "ACTIVE") return false;
  const payload: MatchBuyBoxPayload = { buyBoxId: box.id, version: box.version };
  await repos.jobs.enqueue({
    type: "MATCH_BUY_BOX",
    dedupeKey: `MATCH_BUY_BOX:${box.id}:${box.version}`,
    payload,
  });
  return true;
}
