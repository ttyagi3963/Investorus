// The typed calls the web app makes (T265), one function per route in contracts/api.md. The browser
// uses them against the BFF: `session` signs in and out through the BFF's cookie route, and the
// others go through the BFF's proxy to the api with the cookie's token.
import type { TimelineEntryView } from "../audit/audit.js";
import type {
  CreateListingPackageInput,
  PublishInput,
  UpdateListingPackageInput,
  WithdrawInput,
} from "../listing-package/inputs.js";
import type {
  InvestorPackageSummary,
  InvestorPackageView,
} from "../listing-package/investor-views.js";
import type { AgentPackageSummary, AgentPackageView } from "../listing-package/views.js";
import type { NotificationView } from "../notification/notification.js";
import type { CreateOfferInput, ReviseOfferInput } from "../offer/inputs.js";
import type { OfferView } from "../offer/offer.js";
import type { AddPhotoInput, CreatePhotoUploadInput } from "../photo/inputs.js";
import type { Photo, PhotoUpload } from "../photo/photo.js";
import type { CreateSessionInput } from "../auth/auth.js";
import type { UserView } from "../user/views.js";
import type { ApiClient, RequestOptions } from "./http.js";

const pkgPath = (id: string) => `/listing-packages/${encodeURIComponent(id)}`;

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
});

/** What a matched investor reads, and their offers (T302). */
export const investorClient = (api: ApiClient) => ({
  packages: () => api.request<InvestorPackageSummary[]>("GET", "/investor/packages"),
  package: (id: string) =>
    api.request<InvestorPackageView>("GET", `/investor/packages/${encodeURIComponent(id)}`),
  makeOffer: (packageId: string, input: CreateOfferInput, options?: RequestOptions) =>
    api.request<OfferView>("POST", `${pkgPath(packageId)}/offers`, input, options),
  reviseOffer: (offerId: string, input: ReviseOfferInput, options?: RequestOptions) =>
    api.request<OfferView>("PATCH", `/offers/${encodeURIComponent(offerId)}`, input, options),
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
