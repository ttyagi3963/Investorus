// The typed calls the web app makes (T265), one function per route in contracts/api.md. The browser
// uses them against the BFF: `session` signs in and out through the BFF's cookie route, and the
// others go through the BFF's proxy to the api with the cookie's token.
import type {
  CreateListingPackageInput,
  UpdateListingPackageInput,
} from "../listing-package/inputs.js";
import type { AgentPackageSummary, AgentPackageView } from "../listing-package/views.js";
import type { AddPhotoInput, CreatePhotoUploadInput } from "../photo/inputs.js";
import type { Photo, PhotoUpload } from "../photo/photo.js";
import type { CreateSessionInput } from "../auth/auth.js";
import type { UserView } from "../user/views.js";
import type { ApiClient } from "./http.js";

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
