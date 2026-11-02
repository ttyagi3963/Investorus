// The draft package rules (T259): an agent creates, reads, lists, and edits their own drafts. The
// service validates input, derives city and state from the ZIP, blocks a second package for an
// address (FR-013), keeps agents to their own packages (FR-080), checks an edit on the merged
// result, because some rules span the stored row and the change, and audits each change (XII).
// Edits stop once an offer is accepted, and a published package stays publishable (T375).
// Operations read any package, and each such read of the seller is audited (T386).
import type { AuditAction, AuditEntry } from "@clever/contracts/audit";
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from "@clever/contracts/common";
import {
  createListingPackageInputSchema,
  updateListingPackageInputSchema,
  type AgentPackageParts,
  type AgentPackageSummaryParts,
  type ListingPackage,
  type UpdateListingPackageInput,
} from "@clever/contracts/listing-package";
import type { IClock } from "../../providers/clock/IClock.js";
import type { IGeoProvider, ZipInfo } from "../../providers/geo/IGeoProvider.js";
import type { AddressHasher } from "../../providers/pii-cipher/IPiiCipher.js";
import { isMaterialChange, toListingFacts } from "../../registry/listing-facts.js";
import type { NewAuditEntry } from "../../repositories/audit/IAuditRepository.js";
import { snapshotAndQueueMatching } from "../../workflows/matching/queue-matching.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { matchSummaryOf } from "./match-summary.js";
import { assertEditable, missingToPublish } from "./publish-rules.js";
import { agentOf } from "../actor-guards.js";

/** A package with everything its agent sees: the seller, the property, the photos, how many
 * investors it matched in its current round, and how the last matching run went, as counts. */
export type AgentPackage = AgentPackageParts;

export interface IListingPackageService {
  create(actor: Actor, input: unknown): Promise<AgentPackage>;
  /** The package for its agent, or any package for operations (FR-080). */
  get(actor: Actor, id: string): Promise<AgentPackage>;
  /** The agent's own packages; operations list every package in the console (/ops/listing-packages). */
  list(actor: Actor): Promise<AgentPackageSummaryParts[]>;
  update(actor: Actor, id: string, input: unknown): Promise<AgentPackage>;
  /** What happened to the package, newest first, for its agent (T297). */
  timeline(actor: Actor, id: string): Promise<AuditEntry[]>;
}

type Deps = { geo: IGeoProvider; addressHash: AddressHasher; clock: IClock };

const UNKNOWN_PLACE: ZipInfo = { city: "Unknown", state: "Unknown", neighborhood: "Unknown" };
const invalid = (fields: FieldError[]) => new ValidationError("Some fields are invalid", fields);
const NOT_FOUND = "Package not found";
const AGENTS_ONLY = "Only agents work on listing packages";

const definedFields = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;

/** The names of the fields an edit changes, never their values, for the audit entry. */
const changedFields = ({ version: _version, ...data }: UpdateListingPackageInput): string[] =>
  Object.entries(data)
    .flatMap(([field, value]) => {
      if (value === undefined) return [];
      if (field === "seller" || field === "property") {
        return Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(([key]) => `${field}.${key}`);
      }
      return [field];
    })
    .sort();

export class ListingPackageService implements IListingPackageService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: Deps,
  ) {}

  async create(actor: Actor, input: unknown): Promise<AgentPackage> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = createListingPackageInputSchema.parse(input);
    const { seller, property } = data;
    const errors: FieldError[] = [];
    const place = this.place(property.zip);
    this.checkYear(property.yearBuilt, errors);
    if (errors.length > 0) throw invalid(errors);
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
      await repos.audit.append(this.auditEntry(actor, pkg.id, "PACKAGE_CREATED"));
      return {
        package: pkg,
        seller: savedSeller,
        property: savedProperty,
        photos: [],
        matchedCount: 0,
        matchSummary: null,
      };
    });
  }

  async get(actor: Actor, id: string): Promise<AgentPackage> {
    if (actor.role === "OPS") return this.getForOps(actor, id);
    const agentId = agentOf(actor, AGENTS_ONLY);
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findForAgent(agentId, id);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      return this.load(repos, pkg);
    });
  }

  async list(actor: Actor): Promise<AgentPackageSummaryParts[]> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    return this.uow.run(async (repos) => {
      const pkgs = await repos.packages.listByAgent(agentId);
      // A list row shows no seller and no match summary; its properties, photos, and match counts
      // each come in one query, whatever the number of rows (T386, T396), one after another: a
      // transaction has one connection, so overlapping queries on it only queue (T399).
      const properties = await repos.properties.findByIds(pkgs.map((pkg) => pkg.propertyId));
      const photos = await repos.photos.listByPackages(pkgs.map((pkg) => pkg.id));
      const counts = await repos.matches.countByPackages(pkgs);
      return pkgs.map((pkg) => {
        const property = properties.get(pkg.propertyId);
        if (!property) throw new NotFoundError(NOT_FOUND);
        return {
          package: pkg,
          property,
          photos: photos.get(pkg.id) ?? [],
          matchedCount: counts.get(pkg.id) ?? 0,
        };
      });
    });
  }

  /** Operations see every package, read-only (FR-080); each read of its seller is audited (XII). */
  private getForOps(actor: Actor, id: string): Promise<AgentPackage> {
    return this.uow.run(async (repos) => {
      const pkg = await repos.packages.findById(id);
      if (!pkg) throw new NotFoundError(NOT_FOUND);
      const found = await this.load(repos, pkg);
      await repos.audit.append({
        ...this.auditEntry(actor, id, "PII_ACCESSED"),
        details: { purpose: "OPS_CONSOLE", view: "package", fields: ["seller", "streetLine"] },
      });
      return found;
    });
  }

  async update(actor: Actor, id: string, input: unknown): Promise<AgentPackage> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const data = updateListingPackageInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      const current = await repos.packages.findForAgent(agentId, id);
      if (!current) throw new NotFoundError(NOT_FOUND);
      assertEditable(current);
      const { seller, property, photos } = await this.load(repos, current);
      const change = data.property ?? {};
      const errors: FieldError[] = [];

      // Rules that span the stored row and the change are checked on the merged result.
      const zipChanged = change.zip !== undefined && change.zip !== property.zip;
      const place = zipChanged ? this.place(change.zip!) : null;
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
      const packagePatch = {
        priceExpectationMin: data.priceExpectationMin,
        priceExpectationMax: data.priceExpectationMax,
        closingWindowStart: data.closingWindowStart,
        closingWindowEnd: data.closingWindowEnd,
        currentlyListed: data.currentlyListed,
        eligiblePrograms: data.eligiblePrograms,
      };
      const pkgAfter = { ...current, ...definedFields(packagePatch) };
      const propertyAfter = { ...property, ...definedFields(change), ...(place && place) };
      // Investors can see a published package, so an edit cannot empty a field publishing needs.
      if (current.status !== "DRAFT") {
        errors.push(...missingToPublish(pkgAfter, propertyAfter, photos.length));
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

      // An edit to a field some criterion reads, while offers are open, is a new listing version
      // that matching runs on again (FR-022). With no offers open, matching waits until the
      // deadline is extended (PublicationWorkflow.extendDeadline) or the package is reopened.
      const material =
        current.status === "ACCEPTING_OFFERS" &&
        isMaterialChange(
          toListingFacts(current, property),
          toListingFacts(pkgAfter, propertyAfter),
        );

      // The version check comes first, so a stale edit changes nothing.
      const pkg = await repos.packages.update(id, data.version, {
        addressHash,
        ...packagePatch,
        listingVersion: material ? current.listingVersion + 1 : undefined,
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
      if (material) await snapshotAndQueueMatching(repos, pkg, savedProperty, "PACKAGE_EDIT");
      await repos.audit.append({
        ...this.auditEntry(actor, id, "PACKAGE_UPDATED"),
        details: {
          fields: changedFields(data),
          ...(material && { listingVersion: pkg.listingVersion }),
        },
      });
      const matchedCount = await repos.matches.countByPackage(id, pkg.round);
      const matchSummary = await matchSummaryOf(repos, pkg.id, pkg.round);
      return {
        package: pkg,
        seller: savedSeller,
        property: savedProperty,
        photos,
        matchedCount,
        matchSummary,
      };
    });
  }

  async timeline(actor: Actor, id: string): Promise<AuditEntry[]> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    return this.uow.run(async (repos) => {
      if (!(await repos.packages.findForAgent(agentId, id))) throw new NotFoundError(NOT_FOUND);
      const entries = await repos.audit.listForEntity("ListingPackage", id);
      // Each investor's match decision stays with operations; the agent sees the matched count.
      return entries.filter((entry) => entry.action !== "MATCH_DECISION");
    });
  }

  private auditEntry(actor: Actor, packageId: string, action: AuditAction): NewAuditEntry {
    return {
      actorType: "USER",
      actorId: actor.userId,
      action,
      entityType: "ListingPackage",
      entityId: packageId,
      outcome: "SUCCESS",
    };
  }

  /**
   * The ZIP's city and state. Any 5-digit ZIP is accepted (T421): one that exists nowhere is stored
   * as an unknown place, so an agent is never blocked, and it simply matches no state-wide buy box.
   */
  private place(zip: string): ZipInfo {
    return this.deps.geo.lookup(zip) ?? UNKNOWN_PLACE;
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

  private load(repos: UnitOfWorkRepositories, pkg: ListingPackage): Promise<AgentPackage> {
    return loadAgentPackage(repos, pkg);
  }
}

/** A package with its seller, property, and photos, as its agent sees it. */
export async function loadAgentPackage(
  repos: UnitOfWorkRepositories,
  pkg: ListingPackage,
): Promise<AgentPackage> {
  // One after another: the transaction's one connection runs a query at a time anyway.
  const seller = await repos.sellers.findById(pkg.sellerId);
  const property = await repos.properties.findById(pkg.propertyId);
  const photos = await repos.photos.listByPackage(pkg.id);
  const matchedCount = await repos.matches.countByPackage(pkg.id, pkg.round);
  const matchSummary = await matchSummaryOf(repos, pkg.id, pkg.round);
  if (!seller || !property) throw new NotFoundError(NOT_FOUND);
  return { package: pkg, seller, property, photos, matchedCount, matchSummary };
}
