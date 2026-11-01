// The typed calls the web app makes (T265), one function per route in contracts/api.md. The browser
// uses them against the BFF: `session` signs in and out through the BFF's cookie route, and the
// others go through the BFF's proxy to the api with the cookie's token.
import type { TimelineEntryView } from "../audit/audit.js";
import type { BrandSummary, BrandThemeView } from "../brand/brand.js";
import type { BuyBoxInput } from "../buy-box/inputs.js";
import type { BuyBoxView } from "../buy-box/views.js";
import type {
  CreateDecisionInput,
  FallThroughInput,
  MilestoneInput,
  PromoteBackupInput,
  ReconfirmationInput,
} from "../deal/inputs.js";
import type { DealView, DecisionView } from "../deal/views.js";
import type {
  CreateListingPackageInput,
  OfferDeadlineInput,
  PublishInput,
  UpdateListingPackageInput,
  WithdrawInput,
} from "../listing-package/inputs.js";
import type {
  InvestorPackageSummary,
  InvestorPackageView,
  WinningInvestorPackageView,
} from "../listing-package/investor-views.js";
import type { AgentPackageSummary, AgentPackageView } from "../listing-package/views.js";
import type { DeliveryStatus } from "../events/events.js";
import type { NotificationView } from "../notification/notification.js";
import type {
  CrmComparisonRow,
  DeliveryView,
  MatchExplanation,
  OpsPackageRow,
  PackageTrace,
  RetryAllInput,
  SimulationMode,
  SimulationModes,
  SimulationService,
} from "../ops/ops.js";
import type { ComparisonSort, OfferComparisonView } from "../offer/comparison.js";
import type {
  CounterResponseInput,
  CreateOfferInput,
  ReviseOfferInput,
  WithdrawOfferInput,
} from "../offer/inputs.js";
import type { OfferView } from "../offer/offer.js";
import type { AddPhotoInput, CreatePhotoUploadInput } from "../photo/inputs.js";
import type { Photo, PhotoUpload } from "../photo/photo.js";
import type { CreateSessionInput } from "../auth/auth.js";
import type { UserView } from "../user/views.js";
import type { ImportBatchView, ImportUploadView } from "../investor/import-views.js";
import type { ApiClient, RequestOptions } from "./http.js";

const pkgPath = (id: string) => `/listing-packages/${encodeURIComponent(id)}`;
const offerPath = (id: string) => `/offers/${encodeURIComponent(id)}`;

/** The BFF's session route: it keeps the token in an HTTP-only cookie and returns only the user. */
export const sessionClient = (api: ApiClient) => ({
  signIn: (input: CreateSessionInput) => api.request<{ user: UserView }>("POST", "/session", input),
  signOut: () => api.request<undefined>("DELETE", "/session"),
});

export const listingPackagesClient = (api: ApiClient) => ({
  list: () => api.request<AgentPackageSummary[]>("GET", "/listing-packages"),
  create: (input: CreateListingPackageInput) =>
    api.request<AgentPackageView>("POST", "/listing-packages", input),
  get: (id: string) =>
    api.request<AgentPackageView>("GET", `/listing-packages/${encodeURIComponent(id)}`),
  update: (id: string, input: UpdateListingPackageInput) =>
    api.request<AgentPackageView>("PATCH", `/listing-packages/${encodeURIComponent(id)}`, input),
  publish: (id: string, input: PublishInput) =>
    api.request<AgentPackageView>("POST", `${pkgPath(id)}/publication`, input),
  withdraw: (id: string, input: WithdrawInput) =>
    api.request<AgentPackageView>("POST", `${pkgPath(id)}/withdrawal`, input),
  timeline: (id: string) => api.request<TimelineEntryView[]>("GET", `${pkgPath(id)}/timeline`),
  offers: (id: string) => api.request<OfferView[]>("GET", `${pkgPath(id)}/offers`),
  reopen: (id: string, input: OfferDeadlineInput) =>
    api.request<AgentPackageView>("POST", `${pkgPath(id)}/reopening`, input),
  extendDeadline: (id: string, input: OfferDeadlineInput) =>
    api.request<AgentPackageView>("PATCH", `${pkgPath(id)}/offer-deadline`, input),
  comparison: (id: string, sort: ComparisonSort) =>
    api.request<OfferComparisonView>("GET", `${pkgPath(id)}/offer-comparison?sort=${sort}`),
  decide: (id: string, input: CreateDecisionInput) =>
    api.request<DecisionView>("POST", `${pkgPath(id)}/decisions`, input),
  deal: (id: string) => api.request<DealView>("GET", `${pkgPath(id)}/deal`),
  promoteBackup: (id: string, input: PromoteBackupInput) =>
    api.request<DealView>("POST", `${pkgPath(id)}/backup-promotions`, input),
});

/** The agent's deal after acceptance (T316). */
export const dealsClient = (api: ApiClient) => ({
  recordMilestone: (dealId: string, input: MilestoneInput) =>
    api.request<DealView>("POST", `/deals/${encodeURIComponent(dealId)}/milestones`, input),
  fallThrough: (dealId: string, input: FallThroughInput) =>
    api.request<DealView>("POST", `/deals/${encodeURIComponent(dealId)}/fall-through`, input),
});

/** What a matched investor reads, and their offers (T302). */
export const investorClient = (api: ApiClient) => ({
  packages: () => api.request<InvestorPackageSummary[]>("GET", "/investor/packages"),
  /** The winning investor's answer also carries the seller's contact and the street (T312). */
  package: (id: string) =>
    api.request<InvestorPackageView | WinningInvestorPackageView>(
      "GET",
      `/investor/packages/${encodeURIComponent(id)}`,
    ),
  makeOffer: (packageId: string, input: CreateOfferInput, options?: RequestOptions) =>
    api.request<OfferView>("POST", `${pkgPath(packageId)}/offers`, input, options),
  reviseOffer: (offerId: string, input: ReviseOfferInput, options?: RequestOptions) =>
    api.request<OfferView>("PATCH", `/offers/${encodeURIComponent(offerId)}`, input, options),
  withdrawOffer: (offerId: string, input: WithdrawOfferInput) =>
    api.request<OfferView>("POST", `${offerPath(offerId)}/withdrawal`, input),
  respondToCounter: (offerId: string, input: CounterResponseInput) =>
    api.request<OfferView>("POST", `${offerPath(offerId)}/counter-response`, input),
  reconfirm: (offerId: string, input: ReconfirmationInput) =>
    api.request<OfferView>("POST", `${offerPath(offerId)}/reconfirmation`, input),
});

/** The investor's own buy boxes (T323). A save restates the whole box and the version it read. */
export const buyBoxesClient = (api: ApiClient) => ({
  list: () => api.request<BuyBoxView[]>("GET", "/investor/buy-boxes"),
  get: (id: string) => api.request<BuyBoxView>("GET", `/investor/buy-boxes/${id}`),
  create: (input: BuyBoxInput, options?: RequestOptions) =>
    api.request<BuyBoxView>("POST", "/investor/buy-boxes", input, options),
  save: (id: string, input: BuyBoxInput & { version: number }, options?: RequestOptions) =>
    api.request<BuyBoxView>("PUT", `/investor/buy-boxes/${id}`, input, options),
});

/** Operations' legacy investor import (T323): get an upload link, start, then follow the batch. */
export const investorImportsClient = (api: ApiClient) => ({
  requestUpload: (sizeBytes: number) =>
    api.request<ImportUploadView>("POST", "/ops/investor-imports/uploads", { sizeBytes }),
  start: (input: { storageKey: string; fileName: string }) =>
    api.request<{ jobId: string; batchId: string }>("POST", "/ops/investor-imports", input),
  get: (batchId: string) => api.request<ImportBatchView>("GET", `/ops/investor-imports/${batchId}`),
});

/** The signed-in user's in-app inbox (T300). */
export const notificationsClient = (api: ApiClient) => ({
  list: () => api.request<NotificationView[]>("GET", "/notifications"),
  markRead: (id: string) =>
    api.request<undefined>("POST", `/notifications/${encodeURIComponent(id)}/read`),
});

export const photosClient = (api: ApiClient) => ({
  requestUpload: (packageId: string, input: CreatePhotoUploadInput) =>
    api.request<PhotoUpload>(
      "POST",
      `/listing-packages/${encodeURIComponent(packageId)}/photo-uploads`,
      input,
    ),
  attach: (packageId: string, input: AddPhotoInput) =>
    api.request<Photo>("POST", `/listing-packages/${encodeURIComponent(packageId)}/photos`, input),
  remove: (packageId: string, photoId: string) =>
    api.request<undefined>(
      "DELETE",
      `/listing-packages/${encodeURIComponent(packageId)}/photos/${encodeURIComponent(photoId)}`,
    ),
});

/** Operations' console (T341): packages and their trace, deliveries, the CRM, and outage modes. */
/** The brands (T348): the list and a theme are public; changing a theme is operations only. */
export const brandsClient = (api: ApiClient) => ({
  list: () => api.request<BrandSummary[]>("GET", "/brands"),
  theme: (brandId: string) =>
    api.request<BrandThemeView>("GET", `/brands/${encodeURIComponent(brandId)}/theme`),
  updateTheme: (brandId: string, tokens: unknown) =>
    api.request<BrandThemeView>("PUT", `/ops/brands/${encodeURIComponent(brandId)}/theme`, {
      tokens,
    }),
});

export const opsClient = (api: ApiClient) => ({
  packages: () => api.request<OpsPackageRow[]>("GET", "/ops/listing-packages"),
  trace: (id: string) =>
    api.request<PackageTrace>("GET", `/ops/listing-packages/${encodeURIComponent(id)}/trace`),
  explainMatch: (id: string, investorId: string) =>
    api.request<MatchExplanation>(
      "GET",
      `/ops/listing-packages/${encodeURIComponent(id)}/matches/${encodeURIComponent(investorId)}`,
    ),
  deliveries: (status?: DeliveryStatus) =>
    api.request<DeliveryView[]>(
      "GET",
      status ? `/ops/deliveries?status=${status}` : "/ops/deliveries",
    ),
  retryDelivery: (id: string) =>
    api.request<undefined>("POST", `/ops/deliveries/${encodeURIComponent(id)}/retry`),
  retryAll: (input: RetryAllInput = {}) =>
    api.request<{ count: number }>("POST", "/ops/deliveries/retry-all", input),
  sendDigestsNow: () => api.request<{ jobId: string }>("POST", "/ops/match-digests"),
  crmComparison: () => api.request<CrmComparisonRow[]>("GET", "/ops/crm-comparison"),
  simulations: () => api.request<SimulationModes>("GET", "/ops/simulations"),
  setSimulation: (service: SimulationService, mode: SimulationMode) =>
    api.request<SimulationModes>("PUT", `/ops/simulations/${service}`, { mode }),
});
