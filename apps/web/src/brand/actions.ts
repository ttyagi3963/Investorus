"use server";
// The brand actions (T351, T353). The switcher's remembers the visitor's brand in the `brand`
// cookie, which brand resolution reads before the host; setting a cookie in an action re-renders the
// page, so the new theme shows at once. The theme editor's drops the cached brands after a save.
// A server action is a public endpoint: only a brand that exists is kept, and only a signed-in
// visitor can drop the cache (the api has already checked that the save came from operations).
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

export async function refreshBrands(): Promise<void> {
  if (!(await cookies()).get(SESSION_COOKIE)) return;
  updateTag(BRAND_CACHE_TAG);
}
