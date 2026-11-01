// The brand a request renders, resolved once per request on the server (T349; constitution X): the
// brand list and the chosen brand's theme come from the api through Next's data cache, kept for a
// minute and tagged so the theme editor can drop them the moment a theme is saved (T353). Both wait
// for a request (connection()), so `next build` never reads the settings or calls the api.
import type { BrandSummary, BrandThemeView } from "@clever/contracts/brand";
import { brandsClient, createApiClient } from "@clever/contracts/client";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { serverEnv } from "@/env";
import { pickBrand } from "./pick-brand";

export const BRAND_COOKIE = "brand";
export const BRAND_CACHE_TAG = "brands";
const CACHE_SECONDS = 60;

function brandsApi() {
  return brandsClient(
    createApiClient({
      baseUrl: `${serverEnv().API_URL}/api/v1`,
      fetch: (input, init) =>
        fetch(input, { ...init, next: { revalidate: CACHE_SECONDS, tags: [BRAND_CACHE_TAG] } }),
    }),
  );
}

export const listBrands = cache(async (): Promise<BrandSummary[]> => {
  await connection();
  return brandsApi().list();
});

export const activeBrand = cache(async (): Promise<BrandThemeView> => {
  const [cookieStore, headerStore, brands] = await Promise.all([cookies(), headers(), listBrands()]);
  const brandId = pickBrand(brands, {
    cookie: cookieStore.get(BRAND_COOKIE)?.value,
    host: headerStore.get("host"),
    defaultBrandId: serverEnv().DEFAULT_BRAND_ID,
  });
  return brandsApi().theme(brandId);
});
