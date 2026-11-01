// The browser's api client (T093's Sprint 1 part): every call goes to the BFF at /bff, which adds
// the session cookie's token, so browser code never sees the token. `ops` is the operations
// console's (T342); `brands` serves the theme editor (T353).
import {
  brandsClient,
  buyBoxesClient,
  createApiClient,
  dealsClient,
  investorClient,
  investorImportsClient,
  listingPackagesClient,
  notificationsClient,
  opsClient,
  photosClient,
  sessionClient,
} from "@clever/contracts/client";

const bff = createApiClient({ baseUrl: "/bff" });

export const session = sessionClient(bff);
export const listingPackages = listingPackagesClient(bff);
export const photos = photosClient(bff);
export const investor = investorClient(bff);
export const notifications = notificationsClient(bff);
export const deals = dealsClient(bff);
export const buyBoxes = buyBoxesClient(bff);
export const investorImports = investorImportsClient(bff);
export const ops = opsClient(bff);
export const brands = brandsClient(bff);
