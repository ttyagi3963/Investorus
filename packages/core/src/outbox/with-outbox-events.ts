// Makes every package status change reach the CRM (T337; FR-077), whichever workflow makes it: the
// repositories a change sees get a package repository that, when an update changes the status,
// appends `package.status_changed` with the listing's snapshot in the same transaction. Both units
// of work apply it, so no call site can forget the event.
import type {
  IListingPackageRepository,
  ListingPackagePatch,
} from "../repositories/listing-package/IListingPackageRepository.js";
import type { UnitOfWorkRepositories } from "../unit-of-work/IUnitOfWork.js";
import { crmSnapshot } from "./crm-snapshot.js";
import { writeEvent } from "./write-event.js";

class StatusEventsPackageRepository implements IListingPackageRepository {
  constructor(
    private readonly inner: IListingPackageRepository,
    private readonly repos: () => UnitOfWorkRepositories,
  ) {}

  create: IListingPackageRepository["create"] = (pkg) => this.inner.create(pkg);
  findForAgent: IListingPackageRepository["findForAgent"] = (agentId, id) =>
    this.inner.findForAgent(agentId, id);
  findById: IListingPackageRepository["findById"] = (id) => this.inner.findById(id);
  findByIds: IListingPackageRepository["findByIds"] = (ids) => this.inner.findByIds(ids);
  listByAgent: IListingPackageRepository["listByAgent"] = (agentId) =>
    this.inner.listByAgent(agentId);
  listOpenForOffers: IListingPackageRepository["listOpenForOffers"] = (now) =>
    this.inner.listOpenForOffers(now);
  findByAddressHash: IListingPackageRepository["findByAddressHash"] = (hash) =>
    this.inner.findByAddressHash(hash);
  lock: IListingPackageRepository["lock"] = (id) => this.inner.lock(id);

  async update(id: string, version: number, patch: ListingPackagePatch) {
    const before = patch.status === undefined ? null : await this.inner.findById(id);
    const after = await this.inner.update(id, version, patch);
    if (before && before.status !== after.status) {
      const repos = this.repos();
      await writeEvent(repos, {
        type: "package.status_changed",
        payload: { packageId: id, from: before.status, crm: await crmSnapshot(repos, after) },
      });
    }
    return after;
  }
}

export function withOutboxEvents(repos: UnitOfWorkRepositories): UnitOfWorkRepositories {
  const wrapped: UnitOfWorkRepositories = {
    ...repos,
    packages: new StatusEventsPackageRepository(repos.packages, () => wrapped),
  };
  return wrapped;
}
