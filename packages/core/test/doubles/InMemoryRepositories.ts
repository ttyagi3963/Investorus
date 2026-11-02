// In-memory stand-ins for the repositories and the unit of work, so service tests run offline
// (constitution XV). They copy the behavior the services rely on: agent-filtered reads, the stale
// version refusal, one package per address, stage 1 of matching, one match per investor and
// round, and one live job per dedupe key. `run` rolls back on a throw, as a transaction does.
import type { BuyBox, BuyBoxInput } from "@clever/contracts/buy-box";
import type { AuditAction, AuditEntry } from "@clever/contracts/audit";
import { BusinessRuleError, ConflictError, ValidationError } from "@clever/contracts/common";
import type { Deal, Decision } from "@clever/contracts/deal";
import type { Investor } from "@clever/contracts/investor";
import type { Job } from "@clever/contracts/jobs";
import { ADDRESS_FREEING_STATUSES, type ListingPackage } from "@clever/contracts/listing-package";
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
import type { IImportRepository } from "../../src/repositories/import/IImportRepository.js";
import type { IConfigRepository } from "../../src/repositories/config/IConfigRepository.js";
import type {
  IOutboxRepository,
  NewOutboxEvent,
} from "../../src/repositories/outbox/IOutboxRepository.js";
import { withOutboxEvents } from "../../src/outbox/with-outbox-events.js";
import type {
  Delivery,
  IDeliveryRepository,
  RetryAllFilter,
} from "../../src/repositories/delivery/IDeliveryRepository.js";
import type { DeliveryPlan } from "@clever/contracts/events";
import type { IOpsQueryRepository } from "../../src/repositories/ops/IOpsQueryRepository.js";
import type {
  BrandRecord,
  IBrandRepository,
} from "../../src/repositories/brand/IBrandRepository.js";
import type { IEffectMarkerRepository } from "../../src/repositories/effect-marker/IEffectMarkerRepository.js";
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
  async canAct(userId: string) {
    return this.credentials.find((c) => c.user.id === userId)?.user.active === true;
  }
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
  async findByIds(ids: string[]) {
    return new Map<string, Property>(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [[id, row] as const] : [];
      }),
    );
  }
  async update(id: string, patch: PropertyPatch) {
    const row = apply(this.rows.get(id)!, patch);
    this.rows.set(id, row);
    return row;
  }
}

export class InMemoryListingPackageRepository implements IListingPackageRepository {
  readonly rows = new Map<string, ListingPackage & { addressHash: string }>();
  /** The partial unique index, answered as the Prisma repository answers it (T383, T403). */
  private assertAddressFree(addressHash: string, exceptId?: string) {
    const taken = [...this.rows.values()].some(
      (r) =>
        r.id !== exceptId &&
        r.addressHash === addressHash &&
        !(ADDRESS_FREEING_STATUSES as readonly string[]).includes(r.status),
    );
    if (taken) {
      throw new BusinessRuleError(
        "This address already has a listing package",
        "DUPLICATE_ACTIVE_LISTING",
      );
    }
  }
  async create(pkg: NewListingPackage) {
    this.assertAddressFree(pkg.addressHash);
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
  async findByIds(ids: string[]) {
    return new Map<string, ListingPackage>(
      ids.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [[id, row] as const] : [];
      }),
    );
  }
  async listByAgent(agentId: string) {
    return [...this.rows.values()].filter((r) => r.agentId === agentId);
  }
  async listOpenForOffers(now: Date) {
    return [...this.rows.values()].filter(
      (r) => r.status === "ACCEPTING_OFFERS" && r.offerDeadline !== null && r.offerDeadline > now,
    );
  }
  async findByAddressHash(addressHash: string) {
    const row = [...this.rows.values()].find(
      (r) =>
        r.addressHash === addressHash &&
        !(ADDRESS_FREEING_STATUSES as readonly string[]).includes(r.status),
    );
    return row ? { id: row.id, agentId: row.agentId } : null;
  }
  /** One test runs at a time, so there is nothing to wait for. */
  async lock() {}
  async update(id: string, version: number, patch: ListingPackagePatch) {
    const row = this.rows.get(id);
    if (!row || row.version !== version)
      throw new ConflictError("This package changed since you opened it.");
    if (patch.addressHash !== undefined) this.assertAddressFree(patch.addressHash, id);
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
  async listByPackages(packageIds: string[]) {
    const byPackage = new Map<string, Photo[]>();
    for (const id of packageIds) {
      const photos = await this.listByPackage(id);
      if (photos.length > 0) byPackage.set(id, photos);
    }
    return byPackage;
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
  async findLatest(
    entityType: string,
    entityId: string,
    action: AuditAction,
    details: Record<string, string | number>,
  ) {
    return (
      this.entries.findLast(
        (e) =>
          e.entityType === entityType &&
          e.entityId === entityId &&
          e.action === action &&
          Object.entries(details).every(([key, value]) => e.details?.[key] === value),
      ) ?? null
    );
  }
}

/**
 * Stage 1 as the SQL does it: the hard cuts and geography. Like the SQL join, a box whose investor
 * is not in `investors` never matches; the unit of work seeds one per investor login it is given.
 */
export class InMemoryBuyBoxRepository implements IBuyBoxRepository {
  readonly boxes: BuyBox[] = [];
  readonly investors = new Map<string, Pick<Investor, "status" | "proofOfFundsExpiresAt">>();
  async countMatchable(now: Date) {
    return this.boxes.filter((box) => this.canMatch(box, now)).length;
  }
  async listCandidates(zip: string, state: string, now: Date) {
    return this.boxes.filter((box) => {
      const covers =
        box.geographyMode === "NATIONWIDE" ||
        box.geography.includes(box.geographyMode === "STATES" ? state : zip);
      return this.canMatch(box, now) && covers;
    });
  }
  /** Box ACTIVE, its investor seeded and ACTIVE, proof of funds after `now`. */
  private canMatch(box: BuyBox, now: Date) {
    const investor = this.investors.get(box.investorId);
    if (!investor) return false;
    const funded = investor.proofOfFundsExpiresAt !== null && investor.proofOfFundsExpiresAt > now;
    return box.status === "ACTIVE" && investor.status === "ACTIVE" && funded;
  }
  readonly versions: { buyBoxId: string; version: number; createdBy: string | null }[] = [];
  async listForInvestor(investorId: string) {
    return this.boxes
      .filter((box) => box.investorId === investorId)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }
  async findById(id: string) {
    return this.boxes.find((box) => box.id === id) ?? null;
  }
  async findDefault(investorId: string) {
    return this.boxes.find((box) => box.investorId === investorId && box.isDefault) ?? null;
  }
  async findMatchable(id: string, version: number, now: Date) {
    const box = await this.findById(id);
    return box && box.version === version && this.canMatch(box, now) ? box : null;
  }
  async create(investorId: string, input: BuyBoxInput, isDefault = false) {
    this.assertNameFree(investorId, input.name, null);
    const box: BuyBox = { ...input, id: nextId("box"), investorId, isDefault, version: 1 };
    this.boxes.push(box);
    return box;
  }
  async update(id: string, version: number, input: BuyBoxInput) {
    const index = this.boxes.findIndex((box) => box.id === id);
    const row = this.boxes[index];
    if (!row || row.version !== version) throw new ConflictError("This buy box changed.");
    this.assertNameFree(row.investorId, input.name, id);
    const next: BuyBox = { ...row, ...input, version: row.version + 1 };
    this.boxes[index] = next;
    return next;
  }
  async appendVersion(box: BuyBox, createdBy: string | null) {
    this.versions.push({ buyBoxId: box.id, version: box.version, createdBy });
  }
  private assertNameFree(investorId: string, name: string, except: string | null) {
    if (this.boxes.some((b) => b.investorId === investorId && b.name === name && b.id !== except)) {
      throw new ValidationError("Some fields need fixing. See the messages below.", [
        { field: "name", message: "You already have a buy box with this name" },
      ]);
    }
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
  async countByPackages(packages: { id: string; round: number }[]) {
    const counts = new Map<string, number>();
    for (const { id, round } of packages) {
      const count = await this.countByPackage(id, round);
      if (count > 0) counts.set(id, count);
    }
    return counts;
  }
  readonly digestedAt = new Map<string, Date>();
  async claimUndigested(at: Date) {
    const pending = this.rows.filter(
      (r) => r.trigger === "BUY_BOX_CHANGE" && !this.digestedAt.has(r.id),
    );
    for (const match of pending) this.digestedAt.set(match.id, at);
    return pending;
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
  async findLatestForInvestor(investorId: string, packages: { id: string; round: number }[]) {
    const latest = new Map<string, Offer>();
    for (const { id, round } of packages) {
      const offer = await this.findLatest(id, investorId, round);
      if (offer) latest.set(id, offer);
    }
    return latest;
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
  renewLease(): Promise<boolean> {
    throw new Error("not used by the services");
  }
  reclaimStale(): Promise<Job[]> {
    throw new Error("not used by the services");
  }
  complete(): Promise<boolean> {
    throw new Error("not used by the services");
  }
  fail(): Promise<Job | null> {
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

/** Every investor is named after its ID unless a test names it. The import's writes need Postgres. */
export class InMemoryInvestorRepository implements IInvestorRepository {
  readonly names = new Map<string, string>();
  readonly contacts = new Map<string, { email: string; phone: string | null }>();
  /** Investors operations deactivated; every other investor is ACTIVE. */
  readonly inactive = new Set<string>();
  async findCompanyNames(ids: string[]) {
    return new Map(ids.map((id) => [id, this.names.get(id) ?? id]));
  }
  async findInactive(ids: string[]) {
    return new Set(ids.filter((id) => this.inactive.has(id)));
  }
  async findContact(id: string) {
    return this.contacts.get(id) ?? null;
  }
  async findIdForImport(): Promise<string | null> {
    throw new Error("The import is tested against Postgres");
  }
  async save(): Promise<string> {
    throw new Error("The import is tested against Postgres");
  }
}

/** The import is tested against Postgres (test/investor-import.int.test.ts). */
export class InMemoryImportRepository implements IImportRepository {
  private unused(): never {
    throw new Error("The import is tested against Postgres");
  }
  createBatch = async () => this.unused();
  setJob = async () => this.unused();
  findBatch = async () => this.unused();
  doneRowNumbers = async () => this.unused();
  addRowResult = async () => this.unused();
  finish = async () => this.unused();
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

/** The events changes appended, in order, with the relay's mark. */
export class InMemoryOutboxRepository implements IOutboxRepository {
  readonly rows: (NewOutboxEvent & {
    id: string;
    occurredAt: Date;
    sequence: number;
    relayedAt: Date | null;
  })[] = [];
  async append(event: NewOutboxEvent) {
    this.rows.push({
      ...event,
      id: nextId("event"),
      occurredAt: NOW,
      sequence: this.rows.length + 1,
      relayedAt: null,
    });
  }
  async claimUnrelayed(limit: number) {
    return this.rows.filter((r) => r.relayedAt === null).slice(0, limit);
  }
  async markRelayed(ids: string[], at: Date) {
    for (const row of this.rows) if (ids.includes(row.id)) row.relayedAt ??= at;
  }
}

/** Deliveries with the dispatcher's status rules, reading their events from the outbox double. */
export class InMemoryDeliveryRepository implements IDeliveryRepository {
  readonly rows: Delivery[] = [];
  constructor(private readonly outbox: InMemoryOutboxRepository) {}
  async createForEvent(outboxEventId: string, plans: DeliveryPlan[]) {
    for (const plan of plans) {
      const exists = this.rows.some(
        (r) =>
          r.outboxEventId === outboxEventId &&
          r.target === plan.target &&
          r.recipientRef === plan.recipientRef,
      );
      if (exists) continue;
      this.rows.push({
        id: nextId("delivery"),
        outboxEventId,
        ...plan,
        status: "PENDING",
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
        queuedAt: null,
        sentAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
  }
  async requeueStale(before: Date) {
    let count = 0;
    for (const row of this.rows) {
      const stale =
        (row.status === "PENDING" && row.queuedAt !== null && row.queuedAt < before) ||
        (row.status === "RETRYING" && row.nextAttemptAt !== null && row.nextAttemptAt < before) ||
        (row.status === "SENDING" && row.updatedAt < before);
      if (!stale) continue;
      Object.assign(row, { status: "PENDING", queuedAt: null, nextAttemptAt: null });
      count += 1;
    }
    return count;
  }
  async claimUnqueued(limit: number, at: Date) {
    const claimed = this.rows
      .filter((r) => r.status === "PENDING" && r.queuedAt === null)
      .slice(0, limit);
    for (const row of claimed) row.queuedAt = at;
    return claimed.map((r) => r.id);
  }
  async releaseQueued(ids: string[], at: Date) {
    for (const row of this.rows) {
      if (ids.includes(row.id) && row.status === "PENDING" && row.queuedAt === at) {
        row.queuedAt = null;
      }
    }
  }
  async findWithEvent(id: string) {
    const row = this.rows.find((r) => r.id === id);
    const event = row && this.outbox.rows.find((e) => e.id === row.outboxEventId);
    return row && event ? { ...row, event } : null;
  }
  private move(id: string, from: Delivery["status"][], patch: Partial<Delivery>, attempt?: number) {
    const row = this.rows.find(
      (r) =>
        r.id === id && from.includes(r.status) && (attempt === undefined || r.attempts === attempt),
    );
    if (row) Object.assign(row, patch);
    return Boolean(row);
  }
  async markSending(id: string) {
    const attempts = (this.rows.find((r) => r.id === id)?.attempts ?? 0) + 1;
    const started = this.move(id, ["PENDING", "RETRYING"], {
      status: "SENDING",
      attempts,
      nextAttemptAt: null,
    });
    return started ? attempts : null;
  }
  async markSent(id: string, attempt: number, at: Date) {
    return this.move(id, ["SENDING"], { status: "SENT", sentAt: at, lastError: null }, attempt);
  }
  async markRetrying(id: string, attempt: number, error: string, nextAttemptAt: Date) {
    const patch = { status: "RETRYING" as const, lastError: error, nextAttemptAt };
    return this.move(id, ["SENDING"], patch, attempt);
  }
  async markNeedsAttention(id: string, attempt: number, error: string) {
    const patch = { status: "NEEDS_ATTENTION" as const, lastError: error, nextAttemptAt: null };
    return this.move(id, ["SENDING"], patch, attempt);
  }
  async giveUp(id: string, error: string) {
    const patch = { status: "NEEDS_ATTENTION" as const, lastError: error, nextAttemptAt: null };
    this.move(id, ["PENDING", "SENDING", "RETRYING"], patch);
  }
  async resetForRetry(id: string) {
    return this.move(id, ["NEEDS_ATTENTION"], {
      status: "PENDING",
      attempts: 0,
      queuedAt: null,
      nextAttemptAt: null,
    });
  }
  async resetAllForRetry({ target, packageId }: RetryAllFilter) {
    let count = 0;
    for (const row of this.rows) {
      const event = this.outbox.rows.find((e) => e.id === row.outboxEventId);
      const chosen =
        (target === undefined || row.target === target) &&
        (packageId === undefined ||
          (event?.aggregateType === "ListingPackage" && event.aggregateId === packageId));
      if (chosen && (await this.resetForRetry(row.id))) count += 1;
    }
    return count;
  }
}

/** The operations read model is SQL joins and counts, tested against Postgres (ops.int.test.ts). */
const OPS_QUERIES_NEED_POSTGRES = new Proxy({} as IOpsQueryRepository, {
  get: () => () => Promise.reject(new Error("Operations reads are tested against Postgres")),
});

/** Brands by ID; a test adds the rows it needs. */
export class InMemoryBrandRepository implements IBrandRepository {
  readonly rows = new Map<string, BrandRecord>();
  async list() {
    return [...this.rows.values()].map(({ id, name, hosts }) => ({ id, name, hosts }));
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async updateTokens(id: string, tokens: unknown, expectedVersion: number) {
    const row = this.rows.get(id);
    if (row?.tokenVersion !== expectedVersion) return null;
    row.tokens = tokens;
    row.tokenVersion += 1;
    return row.tokenVersion;
  }
}

/** Effect keys already claimed. */
export class InMemoryEffectMarkerRepository implements IEffectMarkerRepository {
  readonly keys = new Set<string>();
  async claimOnce(key: string) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
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
    imports: InMemoryImportRepository;
    outbox: InMemoryOutboxRepository;
    deliveries: InMemoryDeliveryRepository;
    brands: InMemoryBrandRepository;
    effects: InMemoryEffectMarkerRepository;
  };
  constructor(users: UserCredentials[] = []) {
    const outbox = new InMemoryOutboxRepository();
    const investors = new InMemoryInvestorRepository();
    // An investor login means an investor row, as in Postgres: ACTIVE, with proof of funds.
    const buyBoxes = new InMemoryBuyBoxRepository();
    for (const { user } of users) {
      if (user.role === "INVESTOR") {
        buyBoxes.investors.set(user.investorId, {
          status: "ACTIVE",
          proofOfFundsExpiresAt: new Date("2100-01-01T00:00:00Z"),
        });
      }
    }
    this.repos = {
      users: new InMemoryUserRepository(users),
      sellers: new InMemorySellerRepository(),
      properties: new InMemoryPropertyRepository(),
      packages: new InMemoryListingPackageRepository(),
      photos: new InMemoryPhotoRepository(),
      audit: new InMemoryAuditRepository(),
      buyBoxes,
      listingVersions: new InMemoryListingVersionRepository(),
      matches: new InMemoryMatchRepository(),
      notifications: new InMemoryNotificationRepository(),
      offers: new InMemoryOfferRepository(),
      jobs: new InMemoryJobRepository(),
      config: new InMemoryConfigRepository(),
      investors,
      decisions: new InMemoryDecisionRepository(),
      deals: new InMemoryDealRepository(),
      imports: new InMemoryImportRepository(),
      outbox,
      deliveries: new InMemoryDeliveryRepository(outbox),
      opsQuery: OPS_QUERIES_NEED_POSTGRES,
      brands: new InMemoryBrandRepository(),
      effects: new InMemoryEffectMarkerRepository(),
    };
  }
  /** Rolls back like a transaction: if `work` throws, every store is put back as it was. */
  async run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    const saved = Object.values(this.repos).flatMap((repo) =>
      Object.values(repo as object)
        .filter((store) => store instanceof Array || store instanceof Map || store instanceof Set)
        .map((store) => [store, structuredClone(store)] as const),
    );
    try {
      return await work(withOutboxEvents(this.repos));
    } catch (err) {
      // In place, because tests hold the same arrays, maps, and sets.
      for (const [store, copy] of saved) {
        if (store instanceof Array) store.splice(0, store.length, ...(copy as unknown[]));
        else if (store instanceof Map) {
          store.clear();
          for (const [key, value] of copy as Map<unknown, unknown>) store.set(key, value);
        } else {
          store.clear();
          for (const value of copy as Set<unknown>) store.add(value);
        }
      }
      throw err;
    }
  }
}
