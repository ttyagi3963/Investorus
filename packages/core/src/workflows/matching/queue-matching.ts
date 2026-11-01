// What a publish and a material edit both do, inside their own change (T291; constitution VIII):
// snapshot the listing version's facts and queue one MATCH_PACKAGE job for it. The dedupe key
// names the version, so the same version is never matched twice at once.
import type { MatchPackagePayload } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Property } from "@clever/contracts/property";
import { EVALUATOR_VERSION } from "../../registry/evaluators.js";
import { toListingFacts } from "../../registry/listing-facts.js";
import type { UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

export async function snapshotAndQueueMatching(
  repos: UnitOfWorkRepositories,
  pkg: ListingPackage,
  property: Property,
): Promise<void> {
  const { id: packageId, round, listingVersion } = pkg;
  await repos.listingVersions.append({
    packageId,
    listingVersion,
    round,
    snapshot: toListingFacts(pkg, property),
    evaluatorVersion: EVALUATOR_VERSION,
  });
  const payload: MatchPackagePayload = { packageId, round, listingVersion };
  await repos.jobs.enqueue({
    type: "MATCH_PACKAGE",
    dedupeKey: `MATCH_PACKAGE:${packageId}:${round}:${listingVersion}`,
    payload,
  });
}
