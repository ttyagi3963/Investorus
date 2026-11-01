// In-memory stand-ins for the repositories and the unit of work, so service tests run offline
// (constitution XV). They copy the behavior the services rely on: agent-filtered reads, the stale
// version refusal, and one package per address. `run` does not roll back.
import { ConflictError } from "@clever/contracts/common";
import type { ListingPackage } from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { User, UserCredentials } from "@clever/contracts/user";
import type {
  IAuditRepository,
  NewAuditEntry,
} from "../../src/repositories/audit/IAuditRepository.js";
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

export class InMemoryUnitOfWork implements IUnitOfWork {
  readonly repos: UnitOfWorkRepositories & {
    sellers: InMemorySellerRepository;
    properties: InMemoryPropertyRepository;
    packages: InMemoryListingPackageRepository;
    photos: InMemoryPhotoRepository;
    audit: InMemoryAuditRepository;
  };
  constructor(users: UserCredentials[] = []) {
    this.repos = {
      users: new InMemoryUserRepository(users),
      sellers: new InMemorySellerRepository(),
      properties: new InMemoryPropertyRepository(),
      packages: new InMemoryListingPackageRepository(),
      photos: new InMemoryPhotoRepository(),
      audit: new InMemoryAuditRepository(),
    };
  }
  run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return work(this.repos);
  }
}
