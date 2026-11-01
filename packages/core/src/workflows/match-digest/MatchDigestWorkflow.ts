// The daily match digest (T340; FR-023, contracts/events.md). A buy box saved or edited later matches
// packages already taking offers; those matches reach the investor in the app at once and by email
// once a day, here. A run writes one `investor.match_digest` event per investor with matches to
// packages still taking offers, marks every pending match digested (so a second run sends nothing),
// audits the run, and schedules the next one at ConfigEntry["matchDigest"].hourUtc, keyed by date so
// it is queued once. The worker calls ensureScheduled at startup; operations can run one now.
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError } from "@clever/contracts/common";
import type { OutboxEventInput } from "@clever/contracts/events";
import type { SendMatchDigestsPayload } from "@clever/contracts/jobs";
import type { Match } from "@clever/contracts/match";
import { writeEvent } from "../../outbox/write-event.js";
import type { IClock } from "../../providers/clock/IClock.js";
import { readConfig } from "../../repositories/config/read-config.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

type DigestEvent = Extract<OutboxEventInput, { type: "investor.match_digest" }>;
type DigestMatch = DigestEvent["payload"]["matches"][number];

const DAY_MS = 24 * 60 * 60 * 1_000;
const dateOf = (at: Date) => at.toISOString().slice(0, 10);

export interface IMatchDigestWorkflow {
  send(payload: SendMatchDigestsPayload): Promise<void>;
  ensureScheduled(): Promise<void>;
  sendNow(actor: Actor): Promise<{ jobId: string }>;
}

export class MatchDigestWorkflow implements IMatchDigestWorkflow {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { clock: IClock },
  ) {}

  async send({ digestDate }: SendMatchDigestsPayload): Promise<void> {
    const now = this.deps.clock.now();
    await this.uow.run(async (repos) => {
      const pending = await repos.matches.listUndigested();
      const byInvestor = new Map<string, Match[]>();
      for (const match of pending) {
        byInvestor.set(match.investorId, [...(byInvestor.get(match.investorId) ?? []), match]);
      }
      let emailed = 0;
      for (const [investorId, matches] of byInvestor) {
        const open = await this.openListings(repos, matches);
        if (open.length > 0) {
          await writeEvent(repos, {
            type: "investor.match_digest",
            payload: { investorId, digestDate, matches: open },
          });
          emailed += 1;
        }
      }
      if (pending.length > 0) {
        await repos.matches.markDigested(
          pending.map((match) => match.id),
          now,
        );
      }
      await repos.audit.append({
        actorType: "SYSTEM",
        actorId: null,
        action: "MATCH_DIGESTS_SENT",
        entityType: "MatchDigest",
        entityId: digestDate,
        outcome: "SUCCESS",
        details: { investors: emailed, matches: pending.length },
      });
      await this.scheduleNext(repos, now);
    });
  }

  async ensureScheduled(): Promise<void> {
    await this.uow.run((repos) => this.scheduleNext(repos, this.deps.clock.now()));
  }

  async sendNow(actor: Actor): Promise<{ jobId: string }> {
    if (actor.role !== "OPS") throw new ForbiddenError("Only operations can send the digest");
    const now = this.deps.clock.now();
    const job = await this.uow.run((repos) =>
      repos.jobs.enqueue({
        type: "SEND_MATCH_DIGESTS",
        // One request a minute at most: a second click while one is queued reuses it.
        dedupeKey: `SEND_MATCH_DIGESTS:now:${now.toISOString().slice(0, 16)}`,
        payload: { digestDate: dateOf(now) } satisfies SendMatchDigestsPayload,
      }),
    );
    return { jobId: job.id };
  }

  /** The packages still taking offers, as the email lists them; the rest only count as digested. */
  private async openListings(
    repos: UnitOfWorkRepositories,
    matches: Match[],
  ): Promise<DigestMatch[]> {
    const listings: DigestMatch[] = [];
    for (const match of matches) {
      const pkg = await repos.packages.findById(match.packageId);
      if (pkg?.status !== "ACCEPTING_OFFERS") continue;
      const property = await repos.properties.findById(pkg.propertyId);
      if (!property) continue;
      listings.push({
        packageId: pkg.id,
        city: property.city,
        state: property.state,
        zip: property.zip,
        propertyType: property.propertyType,
        priceMin: pkg.priceExpectationMin,
        priceMax: pkg.priceExpectationMax,
      });
    }
    return listings;
  }

  /** Today's run if its hour is still ahead, else tomorrow's; a date already queued is kept. */
  private async scheduleNext(repos: UnitOfWorkRepositories, now: Date): Promise<void> {
    const { hourUtc } = await readConfig(repos.config, "matchDigest");
    const today = new Date(`${dateOf(now)}T00:00:00Z`).getTime() + hourUtc * 60 * 60 * 1_000;
    const runAt = new Date(today > now.getTime() ? today : today + DAY_MS);
    const digestDate = dateOf(runAt);
    await repos.jobs.enqueue({
      type: "SEND_MATCH_DIGESTS",
      dedupeKey: `SEND_MATCH_DIGESTS:${digestDate}`,
      payload: { digestDate } satisfies SendMatchDigestsPayload,
      runAt,
    });
  }
}
