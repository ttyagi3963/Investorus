// Guards the agent's matching summary (T396): it reads the newest matching run of the round, so after
// a material edit is matched again the agent sees the new counts, not the first run's.
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { matchSummaryOf } from "./match-summary.js";

describe("matchSummaryOf", () => {
  it("reads the newest matching run of the round", async () => {
    const uow = new InMemoryUnitOfWork();
    const run = (round: number, evaluated: number) =>
      uow.repos.audit.append({
        actorType: "SYSTEM",
        actorId: null,
        action: "MATCHING_COMPLETED",
        entityType: "ListingPackage",
        entityId: "package-1",
        outcome: "SUCCESS",
        details: { round, evaluated, exclusions: {} },
      });
    await run(1, 5);
    await run(1, 7);
    await run(2, 9);
    expect(await matchSummaryOf(uow.repos, "package-1", 1)).toMatchObject({ evaluated: 7 });
  });
});
