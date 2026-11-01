// The browser's api client (T093's Sprint 1 part): every call goes to the BFF at /bff, which adds
// the session cookie's token, so browser code never sees the token.
import {
  createApiClient,
  investorClient,
  listingPackagesClient,
  notificationsClient,
  photosClient,
  sessionClient,
} from "@clever/contracts/client";

const bff = createApiClient({ baseUrl: "/bff" });

export const session = sessionClient(bff);
export const listingPackages = listingPackagesClient(bff);
export const photos = photosClient(bff);
export const investor = investorClient(bff);
export const notifications = notificationsClient(bff);
