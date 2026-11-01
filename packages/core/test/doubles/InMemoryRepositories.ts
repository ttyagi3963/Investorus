// In-memory stand-ins for the repositories and the unit of work, so service tests run offline
// (constitution XV). They copy the behavior the services rely on: agent-filtered reads, the stale
// version refusal, one package per address, stage 1 of matching, one match per investor and
// round, and one live job per dedupe key. `run` does not roll back.
import type { BuyBox } from "@clever/contracts/buy-box";
import { ConflictError } from "@clever/contracts/common";
import type { Investor } from "@clever/contracts/investor";
import type { Job } from "@clever/contracts/jobs";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Match } from "@clever/contracts/match";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { User, UserCredentials } from "@clever/contracts/user";
import type {
  IAuditRepository,
  NewAuditEntry,
} from "../../src/repositories/audit/IAuditRepository.js";
import type { IBuyBoxRepository } from "../../src/repositories/buy-box/IBuyBoxRepository.js";
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
import type { IOfferRepository } from "../../src/repositories/offer/IOfferRepository.js";
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
  readonly entries: NewAuditEntry[] = [];
  async append(entry: NewAuditEntry) {
    this.entries.push(entry);
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
  async markNotified(id: string, listingVersion: number) {
    this.rows.find((r) => r.id === id)!.lastNotifiedListingVersion = listingVersion;
  }
  async listByPackage(packageId: string, round: number) {
    return this.rows.filter((r) => r.packageId === packageId && r.round === round);
  }
}

export class InMemoryNotificationRepository implements INotificationRepository {
  readonly rows: NewNotification[] = [];
  async create(notification: NewNotification) {
    this.rows.push(notification);
  }
}

export class InMemoryOfferRepository implements IOfferRepository {
  readonly rows: { packageId: string; round: number; status: "ACTIVE" | "DECLINED" }[] = [];
  async declineOpen(packageId: string, round: number) {
    const open = this.rows.filter(
      (r) => r.packageId === packageId && r.round === round && r.status === "ACTIVE",
    );
    for (const offer of open) offer.status = "DECLINED";
    return open.length;
  }
}

/** Only what the services use: enqueue, with one live job per dedupe key. */
export class InMemoryJobRepository implements IJobRepository {
  readonly rows: Job[] = [];
  async enqueue({ type, dedupeKey, payload }: NewJob) {
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
      runAt: NOW,
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
    };
  }
  run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return work(this.repos);
  }
}
