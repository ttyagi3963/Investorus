"use server";
// The brand actions (T351, T353). The switcher's remembers the visitor's brand in the `brand`
// cookie, which brand resolution reads before the host; setting a cookie in an action re-renders the
// page, so the new theme shows at once. The theme editor's saves a brand's tokens through the api
// with the visitor's session, and drops the cached brands only after the api accepted the save, so
// no one else can empty the cache. A server action is a public endpoint: inputs are checked here.
import type { BrandThemeView } from "@clever/contracts/brand";
import { ApiError, brandsClient, createApiClient } from "@clever/contracts/client";
import { z } from "zod";
import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/bff/shared";
import { serverEnv } from "@/env";
import { BRAND_CACHE_TAG, BRAND_COOKIE, listBrands } from "./active-brand";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function chooseBrand(input: unknown): Promise<void> {
  const brandId = z.string().min(1).parse(input);
  if (!(await listBrands()).some((b) => b.brandId === brandId)) return;
  (await cookies()).set(BRAND_COOKIE, brandId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv().COOKIE_SECURE,
    maxAge: ONE_YEAR_SECONDS,
  });
}

/** The api's answer, as plain data: an action's thrown errors reach the browser without detail. */
export type SaveTokensResult =
  | { ok: true; theme: BrandThemeView }
  | { ok: false; status: number; body: ConstructorParameters<typeof ApiError>[1] };

const saveInputSchema = z.object({
  brandId: z.string().min(1),
  tokens: z.unknown(),
  tokenVersion: z.int().min(1),
});

export async function saveBrandTokens(input: unknown): Promise<SaveTokensResult> {
  const { brandId, tokens, tokenVersion } = saveInputSchema.parse(input);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const api = brandsClient(
    createApiClient({
      baseUrl: `${serverEnv().API_URL}/api/v1`,
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          cache: "no-store",
          headers: { ...init?.headers, ...(token && { Authorization: `Bearer ${token}` }) },
        }),
    }),
  );
  try {
    const theme = await api.updateTheme(brandId, { tokens, tokenVersion });
    updateTag(BRAND_CACHE_TAG);
    return { ok: true, theme };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    const { status, message, code, details } = err;
    return {
      ok: false,
      status,
      body: { error: message, code, details, requestId: err.requestId ?? undefined },
    };
  }
}
