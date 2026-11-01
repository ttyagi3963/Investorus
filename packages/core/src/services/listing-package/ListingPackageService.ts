// The draft package rules (T259): an agent creates, reads, lists, and edits their own drafts. The
// service validates input, derives city and state from the ZIP, blocks a second package for an
// address (FR-013), keeps agents to their own packages (FR-080), and checks an edit on the merged
// result, because some rules span the stored row and the change.
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "@clever/contracts/common";
import {
  createListingPackageInputSchema,
  updateListingPackageInputSchema,
  type ListingPackage,
} from "@clever/contracts/listing-package";
import type { Photo } from "@clever/contracts/photo";
import type { Property } from "@clever/contracts/property";
import type { Seller } from "@clever/contracts/seller";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IGeoProvider, ZipInfo } from "../../providers/geo/IGeoProvider.js";
import type { AddressHasher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";

/** A package with everything its agent sees: the seller, the property, and the photos. */
export type AgentPackage = {
  package: ListingPackage;
  seller: Seller;
  property: Property;
  photos: Photo[];
};

export interface IListingPackageService {
  create(actor: Actor, input: unknown): Promise<AgentPackage>;
  get(actor: Actor, id: string): Promise<AgentPackage>;
  list(actor: Actor): Promise<AgentPackage[]>;
  update(actor: Actor, id: string, input: unknown): Promise<AgentPackage>;
}

type Deps = { geo: IGeoProvider; addressHash: AddressHasher; clock: IClock };

const invalid = (fields: FieldError[]) => new ValidationError("Some fields are invalid", fields);
const NOT_FOUND = "Package not found";

export class ListingPackageService implements IListingPackageService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: Deps,
  ) {}

  async create(actor: Actor, input: unknown): Promise<AgentPackage> {
    const agentId = this.agentOf(actor);
    const data = createListingPackageInputSchema.parse(input);
    const { seller, property } = data;
    const errors: FieldError[] = [];
    const place = this.place(property.zip, errors);
    this.checkYear(property.yearBuilt, errors);
    if (errors.length > 0 || !place) throw invalid(errors);
    const addressHash = this.deps.addressHash(property);

    return this.uow.run(async (repos) => {
      await this.assertAddressFree(repos, addressHash, agentId);
      const savedSeller = await repos.sellers.create({
        fullName: seller.fullName,
        email: seller.email ?? null,
        phone: seller.phone ?? null,
      });
      const savedProperty = await repos.properties.create({
        streetLine: property.streetLine,
        zip: property.zip,
        city: place.city,
        state: place.state,
        neighborhood: property.neighborhood ?? place.neighborhood,
        propertyType: property.propertyType,
        beds: property.beds ?? null,
        baths: property.baths ?? null,
        sqft: property.sqft ?? null,
        lotSqft: property.lotSqft ?? null,
        units: property.units ?? null,
        yearBuilt: property.yearBuilt ?? null,
        condition: property.condition ?? null,
        repairEstimate: property.repairEstimate ?? null,
        addressHash,
      });
      const pkg = await repos.packages.create({
        agentId,
        sellerId: savedSeller.id,
        propertyId: savedProperty.id,
        addressHash,
        priceExpectationMin: data.priceExpectationMin,
        priceExpectationMax: data.priceExpectationMax,
        closingWindowStart: data.closingWindowStart ?? null,
        closingWindowEnd: data.closingWindowEnd ?? null,
        currentlyListed: data.currentlyListed ?? null,
        eligiblePrograms: data.eligiblePrograms ?? [],
      });
      return { package: pkg, seller: savedSeller, property: savedProperty, photos: [] };
    });
  }

  async get(actor: Actor, id: string): Promise<AgentPackage> {
    const agentId = this.agentOf(actor);
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findForAgent(agentId, id);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      return this.load(repos, pkg);
    });
  }

  async list(actor: Actor): Promise<AgentPackage[]> {
    const agentId = this.agentOf(actor);
    return this.uow.run(async (repos) => {
      const pkgs = await repos.packages.listByAgent(agentId);
      return Promise.all(pkgs.map((pkg) => this.load(repos, pkg)));
    });
  }

  async update(actor: Actor, id: string, input: unknown): Promise<AgentPackage> {
    const agentId = this.agentOf(actor);
    const data = updateListingPackageInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await repos.packages.findForAgent(agentId, id);
      if (!current) throw new NotFoundError(NOT_FOUND);
      const { seller, property } = await this.load(repos, current);
      const change = data.property ?? {};
      const errors: FieldError[] = [];

      // Rules that span the stored row and the change are checked on the merged result.
      const zipChanged = change.zip !== undefined && change.zip !== property.zip;
      const place = zipChanged ? this.place(change.zip!, errors) : null;
      this.checkYear(change.yearBuilt, errors);
      const type = change.propertyType ?? property.propertyType;
      const units = change.units !== undefined ? change.units : property.units;
      if (units !== null && type !== "MULTI_FAMILY") {
        errors.push({ field: "property.units", message: "Units apply only to multi-family homes" });
      }
      const min = data.priceExpectationMin ?? current.priceExpectationMin;
      const max = data.priceExpectationMax ?? current.priceExpectationMax;
      if (min > max)
        errors.push({
          field: "priceExpectationMax",
          message: "Must be at least the minimum price",
        });
      const start =
        data.closingWindowStart !== undefined
          ? data.closingWindowStart
          : current.closingWindowStart;
      const end =
        data.closingWindowEnd !== undefined ? data.closingWindowEnd : current.closingWindowEnd;
      if (start && end && start > end) {
        errors.push({
          field: "closingWindowEnd",
          message: "Must be on or after the start of the closing window",
        });
      }
      const email = data.seller?.email !== undefined ? data.seller.email : seller.email;
      const phone = data.seller?.phone !== undefined ? data.seller.phone : seller.phone;
      if (email === null && phone === null) {
        errors.push({ field: "seller.email", message: "Enter an email or a phone number" });
      }
      if (errors.length > 0) throw invalid(errors);

      const addressChanged = change.streetLine !== undefined || zipChanged;
      const addressHash = addressChanged
        ? this.deps.addressHash({
            streetLine: change.streetLine ?? property.streetLine,
            zip: change.zip ?? property.zip,
          })
        : undefined;
      if (addressHash) await this.assertAddressFree(repos, addressHash, agentId, id);

      // The version check comes first, so a stale edit changes nothing.
      const pkg = await repos.packages.update(id, data.version, {
        addressHash,
        priceExpectationMin: data.priceExpectationMin,
        priceExpectationMax: data.priceExpectationMax,
        closingWindowStart: data.closingWindowStart,
        closingWindowEnd: data.closingWindowEnd,
        currentlyListed: data.currentlyListed,
        eligiblePrograms: data.eligiblePrograms,
      });
      const savedSeller = data.seller ? await repos.sellers.update(seller.id, data.seller) : seller;
      const savedProperty = data.property
        ? await repos.properties.update(property.id, {
            ...change,
            ...(place && {
              city: place.city,
              state: place.state,
              neighborhood:
                change.neighborhood !== undefined ? change.neighborhood : place.neighborhood,
            }),
            addressHash,
          })
        : property;
      const photos = await repos.photos.listByPackage(id);
      return { package: pkg, seller: savedSeller, property: savedProperty, photos };
    });
  }

  private agentOf(actor: Actor): string {
    if (actor.role !== "AGENT") throw new ForbiddenError("Only agents work on listing packages");
    return actor.agentId;
  }

  private place(zip: string, errors: FieldError[]): ZipInfo | null {
    const place = this.deps.geo.lookup(zip);
    if (!place) errors.push({ field: "property.zip", message: "Unknown ZIP code" });
    return place;
  }

  private checkYear(year: number | null | undefined, errors: FieldError[]) {
    if (year != null && year > this.deps.clock.now().getUTCFullYear()) {
      errors.push({ field: "property.yearBuilt", message: "Cannot be in the future" });
    }
  }

  /** One package per address, across every agent; only the owner learns which package it is. */
  private async assertAddressFree(
    repos: UnitOfWorkRepositories,
    addressHash: string,
    agentId: string,
    exceptId?: string,
  ) {
    const existing = await repos.packages.findByAddressHash(addressHash);
    if (existing && existing.id !== exceptId) {
      throw new BusinessRuleError(
        "This address already has a listing package",
        "DUPLICATE_ACTIVE_LISTING",
        existing.agentId === agentId ? { existingPackageId: existing.id } : undefined,
      );
    }
  }

  private async load(repos: UnitOfWorkRepositories, pkg: ListingPackage): Promise<AgentPackage> {
    const [seller, property, photos] = await Promise.all([
      repos.sellers.findById(pkg.sellerId),
      repos.properties.findById(pkg.propertyId),
      repos.photos.listByPackage(pkg.id),
    ]);
    if (!seller || !property) throw new NotFoundError(NOT_FOUND);
    return { package: pkg, seller, property, photos };
  }
}
