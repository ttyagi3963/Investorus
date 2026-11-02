// An investor's own buy boxes (T321; FR-060, FR-023, XIX.3): they list, read, create, and save
// them, and pause or resume one by saving its status. Input is checked with the registry's schema,
// every ZIP code with the ZIP lookup, and year built by the clock. A save names the version it
// read, keeps the new version as a snapshot, is audited, and, when the box can match and its
// criteria or status changed, queues MATCH_BUY_BOX in the same change, so packages still taking
// offers are matched against it.
import type { Actor } from "@clever/contracts/auth";
import {
  buyBoxInputSchema,
  updateBuyBoxInputSchema,
  type BuyBox,
  type BuyBoxInput,
} from "@clever/contracts/buy-box";
import { NotFoundError, ValidationError, type FieldError } from "@clever/contracts/common";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IGeoProvider } from "../../providers/geo/IGeoProvider.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { investorOf } from "../actor-guards.js";
import { checkZips } from "./check-zips.js";
import { keepVersionAndMatch, matchingTermsOf } from "./keep-version.js";

export interface IBuyBoxService {
  list(actor: Actor): Promise<BuyBox[]>;
  get(actor: Actor, id: string): Promise<BuyBox>;
  create(actor: Actor, input: unknown): Promise<BuyBox>;
  update(actor: Actor, id: string, input: unknown): Promise<BuyBox>;
}

const NOT_FOUND = "Buy box not found";

const INVESTORS_ONLY = "Only investors manage buy boxes";

export class BuyBoxService implements IBuyBoxService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { geo: IGeoProvider; clock: IClock },
  ) {}

  async list(actor: Actor): Promise<BuyBox[]> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    return this.uow.run((repos) => repos.buyBoxes.listForInvestor(investorId));
  }

  async get(actor: Actor, id: string): Promise<BuyBox> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    return this.uow.run((repos) => this.own(repos, investorId, id));
  }

  async create(actor: Actor, input: unknown): Promise<BuyBox> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const box = this.check(buyBoxInputSchema.parse(input));
    return this.uow.run(async (repos) => {
      const created = await repos.buyBoxes.create(investorId, box);
      await this.saved(repos, actor, created, true);
      return created;
    });
  }

  async update(actor: Actor, id: string, input: unknown): Promise<BuyBox> {
    const investorId = investorOf(actor, INVESTORS_ONLY);
    const { version, ...box } = updateBuyBoxInputSchema.parse(input);
    this.check(box);
    return this.uow.run(async (repos) => {
      const before = await this.own(repos, investorId, id);
      const after = await repos.buyBoxes.update(id, version, box);
      await this.saved(repos, actor, after, matchingTermsOf(after) !== matchingTermsOf(before));
      return after;
    });
  }

  private check(box: BuyBoxInput): BuyBoxInput {
    checkZips(box, this.deps.geo);
    // Up to next year by the clock: a home can be sold before it is finished (T387).
    const latest = this.deps.clock.now().getUTCFullYear() + 1;
    const errors: FieldError[] = (["yearBuiltMin", "yearBuiltMax"] as const)
      .filter((field) => (box[field] ?? 0) > latest)
      .map((field) => ({ field, message: "Must not be after next year" }));
    if (errors.length > 0)
      throw new ValidationError("Some fields need fixing. See the messages below.", errors);
    return box;
  }

  private async own(repos: UnitOfWorkRepositories, investorId: string, id: string) {
    const box = await repos.buyBoxes.findById(id);
    if (!box || box.investorId !== investorId) throw new NotFoundError(NOT_FOUND);
    return box;
  }

  /** The new version's snapshot and audit entry, and matching when it can find something new. */
  private async saved(repos: UnitOfWorkRepositories, actor: Actor, box: BuyBox, changed: boolean) {
    const match = await keepVersionAndMatch(repos, box, { changed, createdBy: actor.userId });
    await repos.audit.append({
      actorType: "USER",
      actorId: actor.userId,
      action: "BUY_BOX_SAVED",
      entityType: "BuyBox",
      entityId: box.id,
      outcome: "SUCCESS",
      details: { investorId: box.investorId, version: box.version, status: box.status, match },
    });
  }
}
