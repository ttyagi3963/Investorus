// In-memory stand-ins for the repositories and the unit of work, so service tests run offline
// (constitution XV). They copy the behavior the services rely on: agent-filtered reads, the stale
// version refusal, one package per address, stage 1 of matching, one match per investor and
// round, and one live job per dedupe key. `run` does not roll back.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { AuditEntry } from "@clever/contracts/audit";
import { BusinessRuleError, ConflictError } from "@clever/contracts/common";
import type { Deal, Decision } from "@clever/contracts/deal";
import type { Investor } from "@clever/contracts/investor";
import type { Job } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Match } from "@clever/contracts/match";
import type { Notification } from "@clever/contracts/notification";
import type { Offer, OfferStatus, OfferTerms, RevisionAuthor } from "@clever/contracts/offer";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { User, UserCredentials } from "@clever/contracts/user";
import type {
  IAuditRepository,
  NewAuditEntry,
} from "../../src/repositories/audit/IAuditRepository.js";
import type { IBuyBoxRepository } from "../../src/repositories/buy-box/IBuyBoxRepository.js";
import type { IConfigRepository } from "../../src/repositories/config/IConfigRepository.js";
import {
  ALREADY_ACCEPTED,
  type DealPatch,
  type IDealRepository,
  type NewDeal,
} from "../../src/repositories/deal/IDealRepository.js";
import type {
  IDecisionRepository,
  NewDecision,
} from "../../src/repositories/decision/IDecisionRepository.js";
import type { IInvestorRepository } from "../../src/repositories/investor/IInvestorRepository.js";
import type { IJobRepository, NewJob } from "../../src/repositories/job/IJobRepository.js";
import type {
  IListingVersionRepository,
  ListingVersionRecord,
} from "../../src/repositories/listing-version/IListingVersionRepository.js";
import type {
  IMatchRepository,
  MatchUpsert,
} from "../../src/repositories/match/IMatchRepository.js";
import type {
  INotificationRepository,
  NewNotification,
} from "../../src/repositories/notification/INotificationRepository.js";
import {
  LIVE_OFFER_STATUSES,
  OPEN_OFFER_STATUSES,
  type IOfferRepository,
  type NewOffer,
  type RevisionOptions,
} from "../../src/repositories/offer/IOfferRepository.js";
import type {
  IListingPackageRepository,
  ListingPackagePatch,
  NewListingPackage,
} from "../../src/repositories/listing-package/IListingPackageRepository.js";
import type { IPhotoRepository, NewPhoto } from "../../src/repositories/photo/IPhotoRepository.js";
import type {
  IPropertyRepository,
  NewProperty,
  PropertyPatch,
} from "../../src/repositories/property/IPropertyRepository.js";
import type {
  ISellerRepository,
  NewSeller,
  SellerPatch,
} from "../../src/repositories/seller/ISellerRepository.js";
import type { IUserRepository } from "../../src/repositories/user/IUserRepository.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../src/unit-of-work/IUnitOfWork.js";

const NOW = new Date("2026-11-01T12:00:00Z");
let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;
/** Copies the defined fields of `patch` onto `target`, as Prisma does. */
const apply = <T extends object>(target: T, patch: object): T => ({
  ...target,
  ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
});

export class InMemoryUserRepository implements IUserRepository {
  constructor(private readonly credentials: UserCredentials[] = []) {}
  async findByEmail(email: string) {
    return this.credentials.find((c) => c.user.email === email) ?? null;
  }
  async findById(id: string): Promise<User | null> {
    return this.credentials.find((c) => c.user.id === id)?.user ?? null;
  }
  async findIdByInvestorId(investorId: string) {
    const found = this.credentials.find(
      (c) => c.user.role === "INVESTOR" && c.user.investorId === investorId,
    );
    return found?.user.id ?? null;
  }
  async findIdByAgentId(agentId: string) {
    const found = this.credentials.find(
      (c) => c.user.role === "AGENT" && c.user.agentId === agentId,
    );
    return found?.user.id ?? null;
  }
}

export class InMemorySellerRepository implements ISellerRepository {
  readonly rows = new Map<string, Seller>();
  async create(seller: NewSeller) {
    const row: Seller = { id: nextId("seller"), ...seller, createdAt: NOW, updatedAt: NOW };
    this.rows.set(row.id, row);
    return row;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async update(id: string, patch: SellerPatch) {
    const row = apply(this.rows.get(id)!, patch);
    this.rows.set(id, row);
    return row;
  }
}

export class InMemoryPropertyRepository implements IPropertyRepository {
  readonly rows = new Map<string, Property & { addressHash: string }>();
  async create(property: NewProperty) {
    const row = { id: nextId("property"), ...property, createdAt: NOW, updatedAt: NOW };
    this.rows.set(row.id, row);
    return row;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async update(id: string, patch: PropertyPatch) {
    const row = apply(this.rows.get(id)!, patch);
    this.rows.set(id, row);
    return row;
  }
}

export class InMemoryListingPackageRepository implements IListingPackageRepository {
  readonly rows = new Map<string, ListingPackage & { addressHash: string }>();
  async create(pkg: NewListingPackage) {
    if (
      [...this.rows.values()].some(
        (r) => r.addressHash === pkg.addressHash && r.status !== "WITHDRAWN",
      )
    ) {
      throw new Error("unique constraint ListingPackage_one_active_per_address");
    }
    const row: ListingPackage & { addressHash: string } = {
      id: nextId("package"),
      ...pkg,
      status: "DRAFT",
      round: 1,
      offerDeadline: null,
      publishedAt: null,
      listingVersion: 0,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async findForAgent(agentId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.agentId === agentId ? row : null;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async listByAgent(agentId: string) {
    return [...this.rows.values()].filter((r) => r.agentId === agentId);
  }
  async findByAddressHash(addressHash: string) {
    const row = [...this.rows.values()].find(
      (r) => r.addressHash === addressHash && r.status !== "WITHDRAWN",
    );
    return row ? { id: row.id, agentId: row.agentId } : null;
  }
  async update(id: string, version: number, patch: ListingPackagePatch) {
    const row = this.rows.get(id);
    if (!row || row.version !== version)
      throw new ConflictError("This package changed since you opened it.");
    const next = { ...apply(row, patch), version: row.version + 1 };
    this.rows.set(id, next);
    return next;
  }
}

export class InMemoryPhotoRepository implements IPhotoRepository {
  readonly rows = new Map<string, Photo>();
  async add(photo: NewPhoto) {
    const row: Photo = { id: nextId("photo"), ...photo, createdAt: NOW };
    this.rows.set(row.id, row);
    return row;
  }
  async listByPackage(packageId: string) {
    return [...this.rows.values()].filter((r) => r.packageId === packageId);
  }
  async remove(packageId: string, photoId: string) {
    const row = this.rows.get(photoId);
    if (!row || row.packageId !== packageId) return false;
    return this.rows.delete(photoId);
  }
}

export class InMemoryAuditRepository implements IAuditRepository {
  readonly entries: AuditEntry[] = [];
  async append({ details, ...entry }: NewAuditEntry) {
    this.entries.push({
      id: nextId("audit"),
      occurredAt: new Date(NOW.getTime() + this.entries.length),
      correlationId: null,
      details: details ?? {},
      ...entry,
    });
  }
  async listForEntity(entityType: string, entityId: string) {
    return this.entries
      .filter((e) => e.entityType === entityType && e.entityId === entityId)
      .reverse();
  }
}

/** Stage 1 as the SQL does it: the hard cuts and geography. Investors default to ACTIVE, funded. */
export class InMemoryBuyBoxRepository implements IBuyBoxRepository {
  readonly boxes: BuyBox[] = [];
  readonly investors = new Map<string, Pick<Investor, "status" | "proofOfFundsExpiresAt">>();
  async listCandidates(zip: string, state: string, now: Date) {
    return this.boxes.filter((box) => {
      const investor = this.investors.get(box.investorId) ?? {
        status: "ACTIVE",
        proofOfFundsExpiresAt: new Date(now.getTime() + 86_400_000),
      };
      const funded =
        investor.proofOfFundsExpiresAt !== null && investor.proofOfFundsExpiresAt > now;
      const covers =
        box.geographyMode === "NATIONWIDE" ||
        box.geography.includes(box.geographyMode === "STATES" ? state : zip);
      return box.status === "ACTIVE" && investor.status === "ACTIVE" && funded && covers;
    });
  }
}

export class InMemoryListingVersionRepository implements IListingVersionRepository {
  readonly rows: ListingVersionRecord[] = [];
  async append(version: ListingVersionRecord) {
    if (await this.find(version.packageId, version.listingVersion)) {
      throw new Error("unique constraint ListingVersion_packageId_listingVersion_key");
    }
    this.rows.push(version);
  }
  async find(packageId: string, listingVersion: number) {
    return (
      this.rows.find((r) => r.packageId === packageId && r.listingVersion === listingVersion) ??
      null
    );
  }
}

export class InMemoryMatchRepository implements IMatchRepository {
  readonly rows: Match[] = [];
  async upsert(m: MatchUpsert) {
    const existing = this.rows.find(
      (r) => r.packageId === m.packageId && r.investorId === m.investorId && r.round === m.round,
    );
    if (existing) {
      existing.matchedBuyBoxIds = [
        ...new Set([...existing.matchedBuyBoxIds, ...m.matchedBuyBoxIds]),
      ];
      return { match: { ...existing }, created: false };
    }
    const match: Match = {
      id: nextId("match"),
      ...m,
      firstMatchedAt: NOW,
      lastNotifiedListingVersion: null,
    };
    this.rows.push(match);
    return { match: { ...match }, created: true };
  }
  async findOne(packageId: string, investorId: string, round: number) {
    return (
      this.rows.find(
        (r) => r.packageId === packageId && r.investorId === investorId && r.round === round,
      ) ?? null
    );
  }
  async listForInvestor(investorId: string) {
    return this.rows.filter((r) => r.investorId === investorId).reverse();
  }
  async markNotified(id: string, listingVersion: number) {
    this.rows.find((r) => r.id === id)!.lastNotifiedListingVersion = listingVersion;
  }
  async listByPackage(packageId: string, round: number) {
    return this.rows.filter((r) => r.packageId === packageId && r.round === round);
  }
  async countByPackage(packageId: string, round: number) {
    return (await this.listByPackage(packageId, round)).length;
  }
}

export class InMemoryNotificationRepository implements INotificationRepository {
  readonly rows: Notification[] = [];
  async create(notification: NewNotification) {
    this.rows.push({
      id: nextId("notification"),
      ...notification,
      readAt: null,
      createdAt: new Date(NOW.getTime() + this.rows.length),
    });
  }
  async listForUser(userId: string) {
    return this.rows.filter((r) => r.userId === userId).reverse();
  }
  async markRead(userId: string, id: string, at: Date) {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return false;
    row.readAt ??= at;
    return true;
  }
}

/** Offers with the partial unique index (one live offer per investor, package, round) and versions. */
export class InMemoryOfferRepository implements IOfferRepository {
  readonly rows: Offer[] = [];
  readonly revisions: {
    offerId: string;
    revision: number;
    author: RevisionAuthor;
    terms: OfferTerms;
  }[] = [];
  async create({ packageId, investorId, round, ...terms }: NewOffer) {
    if (
      this.rows.some(
        (r) =>
          r.packageId === packageId &&
          r.investorId === investorId &&
          r.round === round &&
          LIVE_OFFER_STATUSES.includes(r.status),
      )
    ) {
      throw new BusinessRuleError("You already have an offer on this package", "OFFER_EXISTS");
    }
    const offer: Offer = {
      id: nextId("offer"),
      packageId,
      investorId,
      round,
      ...terms,
      status: "ACTIVE",
      currentRevision: 1,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.rows.push(offer);
    this.revisions.push({ offerId: offer.id, revision: 1, author: "INVESTOR", terms });
    return { ...offer };
  }
  async findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }
  async findLatest(packageId: string, investorId: string, round: number) {
    const mine = this.rows.filter(
      (r) => r.packageId === packageId && r.investorId === investorId && r.round === round,
    );
    return mine.find((r) => LIVE_OFFER_STATUSES.includes(r.status)) ?? mine.at(-1) ?? null;
  }
  async listByPackage(packageId: string, round: number) {
    return this.rows.filter((r) => r.packageId === packageId && r.round === round);
  }
  async revise(
    id: string,
    version: number,
    terms: OfferTerms,
    { author = "INVESTOR", status }: RevisionOptions = {},
  ) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.version !== version) throw new ConflictError("This offer changed.");
    Object.assign(row, terms, {
      ...(status && { status }),
      currentRevision: row.currentRevision + 1,
      version: row.version + 1,
    });
    this.revisions.push({ offerId: id, revision: row.currentRevision, author, terms });
    return { ...row };
  }
  async findLastTerms(offerId: string, author: RevisionAuthor) {
    return (
      this.revisions.filter((r) => r.offerId === offerId && r.author === author).at(-1)?.terms ??
      null
    );
  }
  async updateStatus(id: string, version: number, status: OfferStatus) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.version !== version) throw new ConflictError("This offer changed.");
    Object.assign(row, { status, version: row.version + 1 });
    return { ...row };
  }
  async declineOpen(packageId: string, round: number) {
    const open = this.rows.filter(
      (r) =>
        r.packageId === packageId && r.round === round && OPEN_OFFER_STATUSES.includes(r.status),
    );
    for (const offer of open)
      Object.assign(offer, { status: "DECLINED", version: offer.version + 1 });
    return open.map((offer) => ({ ...offer }));
  }
}

/** Only what the services use: enqueue, with one live job per dedupe key. */
export class InMemoryJobRepository implements IJobRepository {
  readonly rows: Job[] = [];
  async enqueue({ type, dedupeKey, payload, runAt }: NewJob) {
    const live = this.rows.find(
      (j) =>
        j.type === type &&
        j.dedupeKey === dedupeKey &&
        (j.status === "QUEUED" || j.status === "PROCESSING"),
    );
    if (live) return live;
    const job: Job = {
      id: nextId("job"),
      type,
      status: "QUEUED",
      dedupeKey,
      payload,
      runAt: runAt ?? NOW,
      retryCount: 0,
      maxRetries: 3,
      error: null,
      correlationId: null,
    };
    this.rows.push(job);
    return job;
  }
  claimNext(): Promise<Job | null> {
    throw new Error("not used by the services");
  }
  reclaimStale(): Promise<number> {
    throw new Error("not used by the services");
  }
  complete(): Promise<void> {
    throw new Error("not used by the services");
  }
  fail(): Promise<Job> {
    throw new Error("not used by the services");
  }
}

/** The seeded values (T314), so a comparison or a promotion reads what the demo reads. */
export class InMemoryConfigRepository implements IConfigRepository {
  readonly values = new Map<string, unknown>([
    ["netProceeds", { closingCostPct: 0.02, flatFees: 1_500 }],
    ["reconfirmHours", 48],
  ]);
  async findValue(key: string) {
    return this.values.get(key) ?? null;
  }
}

/** Every investor is named after its ID unless a test names it. */
export class InMemoryInvestorRepository implements IInvestorRepository {
  readonly names = new Map<string, string>();
  async findCompanyNames(ids: string[]) {
    return new Map(ids.map((id) => [id, this.names.get(id) ?? id]));
  }
}

export class InMemoryDecisionRepository implements IDecisionRepository {
  readonly rows: Decision[] = [];
  async append(decision: NewDecision) {
    const row: Decision = { id: nextId("decision"), ...decision, createdAt: NOW };
    this.rows.push(row);
    return { ...row };
  }
}

/** Deals with the partial unique index: one active deal per package. */
export class InMemoryDealRepository implements IDealRepository {
  readonly rows: Deal[] = [];
  async create(deal: NewDeal) {
    if (await this.findActiveByPackage(deal.packageId)) {
      throw new BusinessRuleError(ALREADY_ACCEPTED, "PACKAGE_HAS_ACCEPTED_OFFER");
    }
    const row: Deal = {
      id: nextId("deal"),
      ...deal,
      fellThroughReason: null,
      promotedFromBackup: false,
      reconfirmBy: null,
      ...deal,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.rows.push(row);
    return { ...row };
  }
  async findById(id: string) {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }
  async findByOffer(offerId: string) {
    const row = this.rows.find((r) => r.offerId === offerId);
    return row ? { ...row } : null;
  }
  async findLatestByPackage(packageId: string) {
    const row = this.rows.filter((r) => r.packageId === packageId).at(-1);
    return row ? { ...row } : null;
  }
  async update(id: string, version: number, patch: DealPatch) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.version !== version) throw new ConflictError("This deal changed.");
    Object.assign(row, patch, { version: row.version + 1 });
    return { ...row };
  }
  async findActiveByPackage(packageId: string) {
    const row = this.rows.find(
      (r) =>
        r.packageId === packageId &&
        !["CLOSED", "FELL_THROUGH", "RECONFIRM_DECLINED"].includes(r.status),
    );
    return row ? { ...row } : null;
  }
}

export class InMemoryUnitOfWork implements IUnitOfWork {
  readonly repos: UnitOfWorkRepositories & {
    sellers: InMemorySellerRepository;
    properties: InMemoryPropertyRepository;
    packages: InMemoryListingPackageRepository;
    photos: InMemoryPhotoRepository;
    audit: InMemoryAuditRepository;
    buyBoxes: InMemoryBuyBoxRepository;
    listingVersions: InMemoryListingVersionRepository;
    matches: InMemoryMatchRepository;
    notifications: InMemoryNotificationRepository;
    offers: InMemoryOfferRepository;
    jobs: InMemoryJobRepository;
    config: InMemoryConfigRepository;
    investors: InMemoryInvestorRepository;
    decisions: InMemoryDecisionRepository;
    deals: InMemoryDealRepository;
  };
  constructor(users: UserCredentials[] = []) {
    this.repos = {
      users: new InMemoryUserRepository(users),
      sellers: new InMemorySellerRepository(),
      properties: new InMemoryPropertyRepository(),
      packages: new InMemoryListingPackageRepository(),
      photos: new InMemoryPhotoRepository(),
      audit: new InMemoryAuditRepository(),
      buyBoxes: new InMemoryBuyBoxRepository(),
      listingVersions: new InMemoryListingVersionRepository(),
      matches: new InMemoryMatchRepository(),
      notifications: new InMemoryNotificationRepository(),
      offers: new InMemoryOfferRepository(),
      jobs: new InMemoryJobRepository(),
      config: new InMemoryConfigRepository(),
      investors: new InMemoryInvestorRepository(),
      decisions: new InMemoryDecisionRepository(),
      deals: new InMemoryDealRepository(),
    };
  }
  run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return work(this.repos);
  }
}
