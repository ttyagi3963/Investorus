// Guards the daily match digest (T340; FR-023): one email event per investor whose new or edited buy
// boxes matched packages still taking offers, a second run the same day sends nothing, a
// publish-time match is never in a digest (it was emailed at once), the next run is scheduled at
// the configured hour once, and only operations can ask for a digest now.
import type { Actor } from "@clever/contracts/auth";
import type { MatchTrigger } from "@clever/contracts/match";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { MatchDigestWorkflow } from "./MatchDigestWorkflow.js";

const AFTERNOON = new Date("2026-11-04T15:00:00Z");
const ops: Actor = { userId: "user-ops", role: "OPS", agentId: null };

async function setup(now = AFTERNOON) {
  const uow = new InMemoryUnitOfWork();
  uow.repos.config.values.set("matchDigest", { hourUtc: 14 });
  const listing = async (zip: string, status: "ACCEPTING_OFFERS" | "WITHDRAWN") => {
    const property = await uow.repos.properties.create({
      streetLine: `1 ${zip} St`,
      zip,
      city: "Austin",
      state: "TX",
      neighborhood: null,
      propertyType: "SINGLE_FAMILY",
      beds: 3,
      baths: 2,
      sqft: 1_500,
      lotSqft: null,
      units: null,
      yearBuilt: 1990,
      condition: "FAIR",
      repairEstimate: null,
      addressHash: `hash-${zip}`,
    });
    const pkg = await uow.repos.packages.create({
      agentId: "agent-1",
      sellerId: "seller-1",
      propertyId: property.id,
      addressHash: `hash-${zip}`,
      priceExpectationMin: 200_000,
      priceExpectationMax: 250_000,
      closingWindowStart: null,
      closingWindowEnd: null,
      currentlyListed: false,
      eligiblePrograms: ["CASH_OFFER"],
    });
    await uow.repos.packages.update(pkg.id, pkg.version, { status });
    return pkg.id;
  };
  const match = (packageId: string, investorId: string, trigger: MatchTrigger) =>
    uow.repos.matches.upsert({
      packageId,
      investorId,
      round: 1,
      matchedBuyBoxIds: ["box"],
      trigger,
    });

  const open1 = await listing("78701", "ACCEPTING_OFFERS");
  const open2 = await listing("78702", "ACCEPTING_OFFERS");
  const gone = await listing("78703", "WITHDRAWN");
  await match(open1, "investor-1", "BUY_BOX_CHANGE");
  await match(open2, "investor-1", "BUY_BOX_CHANGE");
  await match(gone, "investor-2", "BUY_BOX_CHANGE");
  await match(open1, "investor-3", "PUBLISH");
  uow.repos.outbox.rows.length = 0;

  const digests = new MatchDigestWorkflow(uow, { clock: { now: () => now } });
  const sent = () => uow.repos.outbox.rows.filter((e) => e.type === "investor.match_digest");
  return { uow, digests, sent };
}

describe("MatchDigestWorkflow", () => {
  it("emails each investor's open buy-box matches once a day, and nothing on a second run", async () => {
    const { digests, sent } = await setup();

    await digests.send({ digestDate: "2026-11-04" });
    await digests.send({ digestDate: "2026-11-04" });

    expect(sent()).toHaveLength(1);
    expect(sent()[0]?.payload).toMatchObject({
      investorId: "investor-1",
      matches: [{ zip: "78701" }, { zip: "78702" }],
    });
  });

  it("schedules the next run once, at the configured hour", async () => {
    const { uow, digests } = await setup();

    await digests.send({ digestDate: "2026-11-04" });
    await digests.ensureScheduled();

    const runs = uow.repos.jobs.rows.filter((j) => j.type === "SEND_MATCH_DIGESTS");
    expect(runs.map((j) => [j.dedupeKey, j.runAt.toISOString()])).toEqual([
      ["SEND_MATCH_DIGESTS:2026-11-05", "2026-11-05T14:00:00.000Z"],
    ]);
  });

  it("lets only operations ask for a digest now", async () => {
    const { digests } = await setup();
    const investor: Actor = { userId: "user-i", role: "INVESTOR", investorId: "investor-1" };

    await expect(digests.sendNow(investor)).rejects.toMatchObject({ status: 403 });
    await expect(digests.sendNow(ops)).resolves.toMatchObject({ jobId: expect.any(String) });
  });
});
